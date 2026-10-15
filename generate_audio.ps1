$sampleRate = 44100
$duration = 8
$numSamples = $sampleRate * $duration

function Write-WavFile($filePath, $samples) {
    $fs = [System.IO.File]::Create($filePath)
    $bw = [System.IO.BinaryWriter]::new($fs)
    
    # RIFF header
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
    $bw.Write([System.Int32](36 + $samples.Length * 2))
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
    
    # fmt subchunk
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
    $bw.Write([System.Int32]16)
    $bw.Write([System.Int16]1)
    $bw.Write([System.Int16]1)
    $bw.Write([System.Int32]44100)
    $bw.Write([System.Int32](44100 * 2))
    $bw.Write([System.Int16]2)
    $bw.Write([System.Int16]16)
    
    # data subchunk
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
    $bw.Write([System.Int32]($samples.Length * 2))
    for ($idx = 0; $idx -lt $samples.Length; $idx++) {
        $s = $samples[$idx]
        $clamped = [Math]::Max(-32767.0, [Math]::Min(32767.0, ($s * 26000.0)))
        $val = [System.Int16]$clamped
        $bw.Write($val)
    }
    $bw.Close()
    $fs.Close()
}

$melody = @(261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 261.63)

# 1. Before: Raw, out-of-tune, wobbly pitch, no effects
$samplesBefore = [double[]]::new($numSamples)
for ($i = 0; $i -lt $numSamples; $i++) {
    $t = [double]$i / [double]$sampleRate
    $noteIndex = [int][Math]::Floor($t) % $melody.Length
    $baseFreq = $melody[$noteIndex]
    # Wobbly unstable detuning
    $detune = [Math]::Sin($t * 4.2) * 9.5 + [Math]::Cos($t * 8.3) * 6.5 - 6.0
    $freq = $baseFreq + $detune
    # Dry voice wave
    $val = [Math]::Sin(2 * [Math]::PI * $freq * $t) * 0.75 + [Math]::Sin(4 * [Math]::PI * $freq * $t) * 0.2
    $noteT = $t - [Math]::Floor($t)
    $env = [Math]::Sin([Math]::PI * $noteT)
    $samplesBefore[$i] = $val * $env * 0.8
}
Write-WavFile 'audio/track_before.wav' $samplesBefore

# 2. After: Perfect pitch, warm harmonics, delay, compression simulation
$samplesAfter = [double[]]::new($numSamples)
$delayBuffer = [double[]]::new(11025)
$delayPtr = 0
for ($i = 0; $i -lt $numSamples; $i++) {
    $t = [double]$i / [double]$sampleRate
    $noteIndex = [int][Math]::Floor($t) % $melody.Length
    $freq = $melody[$noteIndex] # Perfect pitch!
    # Controlled sweet vibrato at 5.2Hz
    $vibrato = [Math]::Sin(2 * [Math]::PI * 5.2 * $t) * 0.7
    $f = $freq + $vibrato
    $noteT = $t - [Math]::Floor($t)
    $env = [Math]::Pow([Math]::Sin([Math]::PI * $noteT), 0.65)
    $val = ([Math]::Sin(2 * [Math]::PI * $f * $t) * 0.65 + [Math]::Sin(4 * [Math]::PI * $f * $t) * 0.28 + [Math]::Sin(6 * [Math]::PI * $f * $t) * 0.12) * $env
    
    # Warm optical compressor curve
    $comp = [Math]::Tanh($val * 1.6) * 0.75
    
    # Ping-pong / tape delay echo
    $delayed = $delayBuffer[$delayPtr]
    $delayBuffer[$delayPtr] = $comp + $delayed * 0.42
    $delayPtr = ($delayPtr + 1) % $delayBuffer.Length
    
    $samplesAfter[$i] = $comp * 0.72 + $delayed * 0.32
}
Write-WavFile 'audio/track_after.wav' $samplesAfter

Write-Output "OK_WAV_GENERATED"
