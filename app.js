/**
 * Vocal Studio Pro - Bulletproof Audio Player & Visualizer
 * Fully supports:
 * 1. User uploaded files (Drag & drop or file picker) - works 100% on file:/// and localhost
 * 2. Works seamlessly even if user loads just ONE track or BOTH tracks
 * 3. Native audio output without CORS blocking
 * 4. Automatic file probing for local audio/ folder
 * 5. Procedural synth fallback demo
 */

(function () {
  'use strict';

  // State Management
  const state = {
    currentMode: 'after', // 'before' | 'after'
    isPlaying: false,
    duration: 12,
    currentTime: 0,
    volume: 0.85,
    isMuted: false,
    isLooping: true,
    tracks: {
      before: {
        file: null,
        url: null,
        name: 'Сирий вокал (Демо-трек)',
        duration: 12,
        isLoaded: false,
        isCustom: false,
      },
      after: {
        file: null,
        url: null,
        name: 'Тюнінг + Зведення (Демо-трек)',
        duration: 12,
        isLoaded: false,
        isCustom: false,
      },
    },
    useProceduralSynth: true,
  };

  // Direct Audio Elements (Bypass Web Audio CORS traps on local files)
  const audioBefore = new Audio();
  const audioAfter = new Audio();
  audioBefore.preload = 'auto';
  audioAfter.preload = 'auto';
  audioBefore.volume = state.volume;
  audioAfter.volume = state.volume;

  // DOM Elements
  const dom = {
    btnBefore: document.getElementById('btnModeBefore'),
    btnAfter: document.getElementById('btnModeAfter'),
    btnPlay: document.getElementById('btnPlay'),
    playIcon: document.getElementById('playIcon'),
    btnMute: document.getElementById('btnMute'),
    muteIcon: document.getElementById('muteIcon'),
    volSlider: document.getElementById('volSlider'),
    btnLoop: document.getElementById('btnLoop'),
    seekBarTrack: document.getElementById('seekBarTrack'),
    seekBarFill: document.getElementById('seekBarFill'),
    seekBarThumb: document.getElementById('seekBarThumb'),
    timeCurrent: document.getElementById('timeCurrent'),
    timeTotal: document.getElementById('timeTotal'),
    playerBadgeStatus: document.getElementById('playerBadgeStatus'),
    canvas: document.getElementById('audioVisualizer'),
    ambientBg: document.getElementById('ambientBg'),
    activeTrackTitle: document.getElementById('activeTrackTitle'),
    fileStatusMsg: document.getElementById('fileStatusMsg'),
    toastNotice: document.getElementById('toastNotice'),
    // Drop zones & inputs
    dropZoneBefore: document.getElementById('dropZoneBefore'),
    dropZoneAfter: document.getElementById('dropZoneAfter'),
    fileInputBefore: document.getElementById('fileInputBefore'),
    fileInputAfter: document.getElementById('fileInputAfter'),
    cardInfoBefore: document.getElementById('cardInfoBefore'),
    cardInfoAfter: document.getElementById('cardInfoAfter'),
    // Modals
    modalOverlay: document.getElementById('imageModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalImg: document.getElementById('modalImg'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    // Order form
    orderForm: document.getElementById('orderForm'),
  };

  // Web Audio Context & Analyser
  let audioCtx = null;
  let analyser = null;
  let synthBufferBefore = null;
  let synthBufferAfter = null;
  let synthSource = null;
  let synthStartTime = 0;

  // Show Toast Alert Notification on Screen
  function showToast(message, type = 'info') {
    if (!dom.toastNotice) return;
    dom.toastNotice.textContent = message;
    dom.toastNotice.className = `toast-notice show toast-${type}`;
    clearTimeout(dom.toastNotice._timer);
    dom.toastNotice._timer = setTimeout(() => {
      dom.toastNotice.className = 'toast-notice';
    }, 4500);
  }

  // Format seconds to mm:ss
  function formatTime(sec) {
    if (isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Ensure AudioContext is initialized and running
  function ensureAudioContext() {
    if (!audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
      } catch (e) {
        console.warn('AudioContext not supported:', e);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Generate Procedural Demo Synth (Works instantly when no custom files are loaded)
  function generateDemoAudioBuffers() {
    ensureAudioContext();
    if (!audioCtx) return;

    const sampleRate = audioCtx.sampleRate || 44100;
    const duration = 12;
    const length = sampleRate * duration;

    synthBufferBefore = audioCtx.createBuffer(2, length, sampleRate);
    synthBufferAfter = audioCtx.createBuffer(2, length, sampleRate);

    const bLeft = synthBufferBefore.getChannelData(0);
    const bRight = synthBufferBefore.getChannelData(1);
    const aLeft = synthBufferAfter.getChannelData(0);
    const aRight = synthBufferAfter.getChannelData(1);

    const notes = [
      { f: 220.00, dur: 1.5 },
      { f: 261.63, dur: 1.5 },
      { f: 293.66, dur: 1.5 },
      { f: 329.63, dur: 1.5 },
      { f: 392.00, dur: 2.0 },
      { f: 329.63, dur: 1.5 },
      { f: 261.63, dur: 1.5 },
      { f: 220.00, dur: 1.0 },
    ];

    const delayLen = Math.floor(sampleRate * 0.32);
    const delayBuf = new Float32Array(delayLen);
    let dPtr = 0;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let noteTime = t % 12;
      let accum = 0;
      let freq = 220;
      let relT = 0;
      let noteDur = 1.5;

      for (let n = 0; n < notes.length; n++) {
        if (noteTime >= accum && noteTime < accum + notes[n].dur) {
          freq = notes[n].f;
          relT = noteTime - accum;
          noteDur = notes[n].dur;
          break;
        }
        accum += notes[n].dur;
      }

      const env = Math.sin((Math.PI * relT) / noteDur);
      const safeEnv = Math.max(0, env);

      // Track 1: Before (Raw, wobbling pitch drift, no reverb)
      const wobble = Math.sin(t * 3.5) * 8.5 + Math.cos(t * 7.5) * 5.0 - 4.0;
      const rawFreq = freq + wobble;
      const rawVal = (Math.sin(2 * Math.PI * rawFreq * t) * 0.8 + 
                      Math.sin(4 * Math.PI * rawFreq * t) * 0.2) * safeEnv;
      bLeft[i] = rawVal * 0.75;
      bRight[i] = rawVal * 0.75;

      // Track 2: After (Melodyne in-tune, vibrato, compression, stereo delay & reverb)
      const vibrato = relT > 0.3 ? Math.sin(2 * Math.PI * 5.2 * t) * 0.7 : 0;
      const tunedFreq = freq + vibrato;
      const tunedVal = (Math.sin(2 * Math.PI * tunedFreq * t) * 0.65 + 
                        Math.sin(4 * Math.PI * tunedFreq * t) * 0.25 + 
                        Math.sin(6 * Math.PI * tunedFreq * t) * 0.1) * Math.pow(safeEnv, 0.75);

      const comp = Math.tanh(tunedVal * 1.5) * 0.8;
      const dOut = delayBuf[dPtr];
      delayBuf[dPtr] = comp + dOut * 0.38;
      dPtr = (dPtr + 1) % delayLen;

      aLeft[i] = comp * 0.75 + dOut * 0.25;
      aRight[i] = comp * 0.75 + dOut * 0.25;
    }
  }

  // Play Procedural Synth Buffer
  function playProcedural(offset = 0) {
    ensureAudioContext();
    if (!synthBufferBefore || !synthBufferAfter) {
      generateDemoAudioBuffers();
    }
    if (!audioCtx) return;

    if (synthSource) {
      try { synthSource.stop(); } catch (e) {}
      try { synthSource.disconnect(); } catch (e) {}
    }

    synthSource = audioCtx.createBufferSource();
    synthSource.buffer = state.currentMode === 'before' ? synthBufferBefore : synthBufferAfter;
    synthSource.loop = state.isLooping;

    const gain = audioCtx.createGain();
    gain.gain.value = state.isMuted ? 0 : state.volume;

    synthSource.connect(gain);
    if (analyser) {
      gain.connect(analyser);
      analyser.connect(audioCtx.destination);
    } else {
      gain.connect(audioCtx.destination);
    }

    synthStartTime = audioCtx.currentTime - offset;
    synthSource.start(0, offset);

    synthSource.onended = function () {
      if (!state.isLooping && state.useProceduralSynth) {
        pauseAudio();
        state.currentTime = 0;
        updateTimelineUI(0);
      }
    };
  }

  // Get active audio element or track info
  function getActiveTrack() {
    return state.tracks[state.currentMode];
  }

  function getActiveAudioElement() {
    return state.currentMode === 'before' ? audioBefore : audioAfter;
  }

  function getInactiveAudioElement() {
    return state.currentMode === 'before' ? audioAfter : audioBefore;
  }

  // Update Timeline UI
  function updateTimelineUI(time) {
    state.currentTime = time;
    dom.timeCurrent.textContent = formatTime(time);
    const duration = state.duration > 0 ? state.duration : 12;
    const progress = Math.min(100, Math.max(0, (time / duration) * 100));
    dom.seekBarFill.style.width = `${progress}%`;
    dom.seekBarThumb.style.left = `${progress}%`;
  }

  // Play Audio (Direct, reliable, with no CORS mute)
  function playAudio() {
    ensureAudioContext();

    const activeTrack = getActiveTrack();
    const activeAudio = getActiveAudioElement();
    const inactiveAudio = getInactiveAudioElement();

    // If active track has custom user audio loaded
    if (activeTrack.isCustom && activeAudio.src) {
      state.useProceduralSynth = false;

      // Stop demo synth if running
      if (synthSource) {
        try { synthSource.stop(); } catch (e) {}
      }

      inactiveAudio.pause();
      activeAudio.volume = state.isMuted ? 0 : state.volume;
      activeAudio.currentTime = Math.min(activeAudio.duration || state.duration, state.currentTime);

      const playPromise = activeAudio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          state.isPlaying = true;
          dom.playIcon.textContent = '⏸';
          dom.btnPlay.setAttribute('aria-label', 'Пауза');
          startVisualizerLoop();
          showToast(`▶ Відтворюється: ${activeTrack.name}`, 'success');
        }).catch((err) => {
          console.warn('Audio play error:', err);
          showToast('⚠️ Натисніть ще раз на Play для підтвердження запуску звуку браузером.', 'warning');
        });
      }
    } else {
      // Procedural Demo Synth Playback
      state.useProceduralSynth = true;
      state.isPlaying = true;
      dom.playIcon.textContent = '⏸';
      dom.btnPlay.setAttribute('aria-label', 'Пауза');
      playProcedural(state.currentTime % state.duration);
      startVisualizerLoop();

      if (!state.tracks.before.isCustom && !state.tracks.after.isCustom) {
        showToast('▶ Грає демо-вокал! Завантажте власні треки в картках нижче.', 'info');
      } else {
        showToast(`ℹ️ Для режиму «${state.currentMode === 'before' ? 'ДО' : 'ПІСЛЯ'}» ще не додано файл, грає демо.`, 'info');
      }
    }
  }

  // Pause Audio
  function pauseAudio() {
    state.isPlaying = false;
    dom.playIcon.textContent = '▶';
    dom.btnPlay.setAttribute('aria-label', 'Грати');

    audioBefore.pause();
    audioAfter.pause();

    if (synthSource) {
      try { synthSource.stop(); } catch (e) {}
    }
    if (audioCtx && state.useProceduralSynth) {
      state.currentTime = (audioCtx.currentTime - synthStartTime) % state.duration;
    }
  }

  // Toggle Play / Pause
  function togglePlay() {
    if (state.isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  }

  // Seamless Instant A/B Switch
  function switchMode(newMode) {
    if (state.currentMode === newMode) return;

    // Capture current playback timestamp
    let currentPos = 0;
    if (state.useProceduralSynth) {
      if (audioCtx && state.isPlaying) {
        currentPos = (audioCtx.currentTime - synthStartTime) % state.duration;
      } else {
        currentPos = state.currentTime;
      }
    } else {
      const prevAudio = getActiveAudioElement();
      currentPos = prevAudio.currentTime || state.currentTime;
    }
    state.currentTime = currentPos;

    state.currentMode = newMode;
    const newTrack = getActiveTrack();

    // Update UI Badges & Buttons
    if (newMode === 'before') {
      dom.btnBefore.classList.add('active-before');
      dom.btnAfter.classList.remove('active-after');
      dom.playerBadgeStatus.className = 'player-badge-status status-dry';
      dom.playerBadgeStatus.innerHTML = '🔴 ДО: Без тюнінгу &amp; без ефектів (Raw Dry)';
      dom.activeTrackTitle.textContent = `ДО ОБРОБКИ: ${newTrack.name}`;
      updateEffectsRack(false);
    } else {
      dom.btnAfter.classList.add('active-after');
      dom.btnBefore.classList.remove('active-before');
      dom.playerBadgeStatus.className = 'player-badge-status status-wet';
      dom.playerBadgeStatus.innerHTML = '🟢 ПІСЛЯ: Тюнінг Melodyne + Зведення FX';
      dom.activeTrackTitle.textContent = `ПІСЛЯ ОБРОБКИ: ${newTrack.name}`;
      updateEffectsRack(true);
    }

    // Update total duration
    if (newTrack.duration && newTrack.duration > 0) {
      state.duration = newTrack.duration;
      dom.timeTotal.textContent = formatTime(state.duration);
    }

    // Seamless audio transfer if already playing
    if (state.isPlaying) {
      playAudio();
    }
  }

  // Update Effects Rack visual indicators
  function updateEffectsRack(isActive) {
    const fxCards = document.querySelectorAll('.fx-card');
    fxCards.forEach((card) => {
      const pill = card.querySelector('.fx-pill');
      if (isActive) {
        card.classList.remove('bypassed');
        card.classList.add('active');
        if (pill) pill.textContent = 'АКТИВНО';
      } else {
        card.classList.remove('active');
        card.classList.add('bypassed');
        if (pill) pill.textContent = 'ВИМКНЕНО';
      }
    });
  }

  // Handle Custom File Loading (from input or drag & drop)
  function handleAudioFile(file, targetMode) {
    if (!file) return;

    // Check if it's an audio file
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) {
      showToast(`⚠️ Файл "${file.name}" не схожий на аудіофайл. Оберіть MP3 або WAV.`, 'warning');
      return;
    }

    const fileUrl = URL.createObjectURL(file);
    const audioTarget = targetMode === 'before' ? audioBefore : audioAfter;
    const trackInfo = state.tracks[targetMode];

    trackInfo.file = file;
    trackInfo.url = fileUrl;
    trackInfo.name = file.name;
    trackInfo.isLoaded = true;
    trackInfo.isCustom = true;

    audioTarget.src = fileUrl;
    audioTarget.load();

    // Update UI Card Info
    const infoEl = targetMode === 'before' ? dom.cardInfoBefore : dom.cardInfoAfter;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

    audioTarget.onloadedmetadata = function () {
      trackInfo.duration = audioTarget.duration || 0;
      if (state.currentMode === targetMode) {
        state.duration = trackInfo.duration;
        dom.timeTotal.textContent = formatTime(state.duration);
      }
      infoEl.innerHTML = `
        <div class="loaded-file-badge">
          <span class="file-ok-icon">✅</span>
          <div class="file-meta">
            <strong class="file-name-text" title="${file.name}">${file.name}</strong>
            <span class="file-sub-text">${sizeMb} МБ &bull; ${formatTime(audioTarget.duration)}</span>
          </div>
        </div>
      `;
    };

    audioTarget.onerror = function (e) {
      console.error('Audio load error:', e);
      showToast(`⚠️ Не вдалося відтворити файл "${file.name}". Спробуйте формат MP3 або WAV.`, 'warning');
    };

    // Auto-switch to the track that was just loaded!
    switchMode(targetMode);

    dom.fileStatusMsg.innerHTML = `
      ✨ Завантажено: <strong>${file.name}</strong> (${targetMode === 'before' ? '🔴 ДО' : '🟢 ПІСЛЯ'}). 
      Натисніть <strong>PLAY</strong> щоб послухати!
    `;

    showToast(`✅ Трек «${targetMode === 'before' ? 'ДО' : 'ПІСЛЯ'}» успішно завантажено! Натисніть PLAY.`, 'success');

    // If player was already playing, start new track immediately
    if (state.isPlaying) {
      playAudio();
    }
  }

  // Setup Drag & Drop Handlers for Drop Zones
  function setupDropZone(dropEl, inputEl, mode) {
    if (!dropEl) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropEl.classList.add('drag-active');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropEl.classList.remove('drag-active');
      }, false);
    });

    dropEl.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleAudioFile(files[0], mode);
      }
    });

    if (inputEl) {
      inputEl.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleAudioFile(e.target.files[0], mode);
        }
      });
    }
  }

  // Full-window drag & drop support
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.target.closest('#dropZoneBefore') || e.target.closest('#dropZoneAfter')) {
      return; // Handled specifically
    }
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Default drop: if before is empty, put in before; else put in after
      if (!state.tracks.before.isCustom) {
        handleAudioFile(files[0], 'before');
      } else {
        handleAudioFile(files[0], 'after');
      }
    }
  });

  // Visualizer Animation Loop
  let visualizerAnimId = null;
  function startVisualizerLoop() {
    if (visualizerAnimId) return;

    const ctx = dom.canvas.getContext('2d');
    const drawWidth = (dom.canvas.width = dom.canvas.offsetWidth * window.devicePixelRatio || 800);
    const drawHeight = (dom.canvas.height = dom.canvas.offsetHeight * window.devicePixelRatio || 140);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const w = dom.canvas.offsetWidth || 800;
    const h = dom.canvas.offsetHeight || 140;

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    function renderFrame() {
      visualizerAnimId = requestAnimationFrame(renderFrame);

      // Track timeline updates
      if (state.isPlaying) {
        if (state.useProceduralSynth && audioCtx) {
          const curT = (audioCtx.currentTime - synthStartTime) % state.duration;
          updateTimelineUI(curT);
        } else {
          const activeAudio = getActiveAudioElement();
          if (activeAudio && !activeAudio.paused) {
            updateTimelineUI(activeAudio.currentTime);
            if (activeAudio.duration && isFinite(activeAudio.duration)) {
              state.duration = activeAudio.duration;
              dom.timeTotal.textContent = formatTime(state.duration);
            }
          }
        }
      }

      ctx.clearRect(0, 0, w, h);

      // Canvas grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let y = 20; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Read audio data or simulate rhythmic audio reactivity
      if (state.isPlaying) {
        if (state.useProceduralSynth && analyser) {
          analyser.getByteFrequencyData(dataArray);
        } else {
          // Dynamic frequency simulation synced to playback
          const now = Date.now() * 0.006;
          for (let i = 0; i < bufferLength; i++) {
            const beat = Math.sin(now * 2) > 0.4 ? 1.4 : 0.8;
            const wave = Math.sin(now + i * 0.2) * 40 + Math.cos(now * 1.5 + i * 0.4) * 30;
            dataArray[i] = Math.max(10, Math.min(250, (wave + 80) * beat));
          }
        }
      } else {
        // Idle ambient ripples
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(Date.now() * 0.002 + i * 0.18) * 10 + 16;
        }
      }

      // Draw Bars
      const barCount = 48;
      const barWidth = w / barCount - 3;
      const isWet = state.currentMode === 'after';

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i % bufferLength] / 255;
        const barHeight = Math.max(4, val * (h - 25));
        const x = i * (barWidth + 3);
        const y = h - barHeight;

        const grad = ctx.createLinearGradient(0, h, 0, y);
        if (isWet) {
          grad.addColorStop(0, '#0284c7');
          grad.addColorStop(0.5, '#38bdf8');
          grad.addColorStop(1, i % 2 === 0 ? '#ec4899' : '#f97316');
        } else {
          grad.addColorStop(0, '#7f1d1d');
          grad.addColorStop(0.6, '#ea580c');
          grad.addColorStop(1, '#f87171');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
        ctx.fill();
      }

      // Draw Glow Line
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isWet ? 'rgba(56, 189, 248, 0.9)' : 'rgba(249, 115, 22, 0.85)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = isWet ? '#38bdf8' : '#f97316';

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i % bufferLength] / 255;
        const x = i * (barWidth + 3) + barWidth / 2;
        const y = h / 2 - (val - 0.5) * (h * 0.5);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    renderFrame();
  }

  // Handle Seek Bar Click & Drag
  dom.seekBarTrack.addEventListener('click', function (e) {
    const rect = dom.seekBarTrack.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * state.duration;

    state.currentTime = targetTime;
    updateTimelineUI(targetTime);

    if (state.useProceduralSynth) {
      if (state.isPlaying) {
        playProcedural(targetTime);
      }
    } else {
      const activeAudio = getActiveAudioElement();
      if (activeAudio) {
        activeAudio.currentTime = targetTime;
      }
    }
  });

  // Handle Volume
  dom.volSlider.addEventListener('input', function (e) {
    const val = parseFloat(e.target.value);
    state.volume = val;
    audioBefore.volume = state.isMuted ? 0 : val;
    audioAfter.volume = state.isMuted ? 0 : val;
    dom.muteIcon.textContent = val === 0 ? '🔇' : '🔊';
  });

  dom.btnMute.addEventListener('click', function () {
    state.isMuted = !state.isMuted;
    const vol = state.isMuted ? 0 : state.volume;
    audioBefore.volume = vol;
    audioAfter.volume = vol;
    dom.muteIcon.textContent = state.isMuted ? '🔇' : '🔊';
    showToast(state.isMuted ? 'Звук вимкнено' : 'Звук увімкнено', 'info');
  });

  // Handle Loop Button
  dom.btnLoop.addEventListener('click', function () {
    state.isLooping = !state.isLooping;
    audioBefore.loop = state.isLooping;
    audioAfter.loop = state.isLooping;
    dom.btnLoop.style.color = state.isLooping ? 'var(--sky-400)' : 'var(--text-muted)';
    showToast(state.isLooping ? '🔁 Повтор треку: Увімкнено' : '🔁 Повтор треку: Вимкнено', 'info');
  });

  // Handle Audio Ending
  function setupAudioEndListeners(audio) {
    audio.addEventListener('ended', () => {
      if (!state.isLooping) {
        pauseAudio();
        state.currentTime = 0;
        updateTimelineUI(0);
      }
    });
  }
  setupAudioEndListeners(audioBefore);
  setupAudioEndListeners(audioAfter);

  // Background Wallpaper System (FL Studio, Melodyne, GarageBand, Yamaha)
  const softwareBackdrops = {
    fl_studio: {
      src: 'images/fl_studio.svg',
      title: 'FL Studio 24 - Студійний мікшер та проект зведення',
    },
    melodyne: {
      src: 'images/melodyne.svg',
      title: 'Celemony Melodyne 5 - Тюнінг вокалу та виправлення фальшивих нот',
    },
    garageband: {
      src: 'images/garageband.svg',
      title: 'GarageBand - Аранжування, живі інструменти та вокальні треки',
    },
    yamaha: {
      src: 'images/yamaha.svg',
      title: 'Yamaha Synthesizer Workstation - Живий акомпанемент та клавішні',
    },
  };

  window.setAmbientBackground = function (key, evt) {
    const item = softwareBackdrops[key];
    if (!item) return;

    dom.ambientBg.style.backgroundImage = `url('${item.src}')`;
    dom.ambientBg.style.opacity = '0.24';

    const eventObj = evt || (typeof window !== 'undefined' ? window.event : null);
    const btn = eventObj ? (eventObj.currentTarget || eventObj.target) : null;
    if (btn) {
      const origText = btn.innerHTML;
      btn.innerHTML = '✓ Встановлено!';
      setTimeout(() => {
        btn.innerHTML = origText;
      }, 1500);
    }
    showToast(`🖼️ Фонову заставку змінено: ${item.title}`, 'info');
  };

  window.openImageModal = function (key) {
    const item = softwareBackdrops[key];
    if (!item) return;

    dom.modalTitle.textContent = item.title;
    dom.modalImg.src = item.src;
    dom.modalImg.alt = item.title;
    dom.modalOverlay.classList.add('active');
  };

  dom.modalCloseBtn.addEventListener('click', function () {
    dom.modalOverlay.classList.remove('active');
  });

  dom.modalOverlay.addEventListener('click', function (e) {
    if (e.target === dom.modalOverlay) {
      dom.modalOverlay.classList.remove('active');
    }
  });

  // Keyboard Shortcuts (Space to play/pause, A/B to switch mode)
  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'a' || e.key === 'A' || e.key === '1') {
      switchMode('before');
    } else if (e.key === 'b' || e.key === '2') {
      switchMode('after');
    }
  });

  // Event Listeners for Switch & Controls
  dom.btnBefore.addEventListener('click', () => switchMode('before'));
  dom.btnAfter.addEventListener('click', () => switchMode('after'));
  dom.btnPlay.addEventListener('click', togglePlay);

  // Setup Drop Zones
  setupDropZone(dom.dropZoneBefore, dom.fileInputBefore, 'before');
  setupDropZone(dom.dropZoneAfter, dom.fileInputAfter, 'after');

  // Contact Form
  if (dom.orderForm) {
    dom.orderForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('clientName').value || 'Клієнт';
      const phone = document.getElementById('clientPhone').value || '';
      const service = document.getElementById('clientService').value || 'Тюнінг вокалу';
      const details = document.getElementById('clientDetails').value || '';

      const text = `Привіт! Мене звати ${name}. Мій контакт: ${phone}. Хочу замовити послугу: "${service}". Деталі: ${details}`;
      const encoded = encodeURIComponent(text);
      window.open(`https://t.me/share/url?url=&text=${encoded}`, '_blank');
    });
  }

  // Pre-load default background
  dom.ambientBg.style.backgroundImage = "url('images/melodyne.svg')";

  // Auto-probe local audio folder in background for common file names
  function autoProbeLocalFiles() {
    const candidatesBefore = [
      'audio/track_before.mp3', 'audio/track_before.wav', 'audio/before.mp3', 'audio/before.wav',
      'track_before.mp3', 'track_before.wav', 'before.mp3', 'before.wav'
    ];
    const candidatesAfter = [
      'audio/track_after.mp3', 'audio/track_after.wav', 'audio/after.mp3', 'audio/after.wav',
      'track_after.mp3', 'track_after.wav', 'after.mp3', 'after.wav'
    ];

    function probe(list, mode) {
      for (const path of list) {
        const testAudio = new Audio();
        testAudio.oncanplay = function () {
          if (!state.tracks[mode].isCustom) {
            const targetAudio = mode === 'before' ? audioBefore : audioAfter;
            targetAudio.src = path;
            state.tracks[mode].isLoaded = true;
            state.tracks[mode].isCustom = true;
            state.tracks[mode].name = path.split('/').pop();
            state.tracks[mode].duration = testAudio.duration || 12;
            const infoEl = mode === 'before' ? dom.cardInfoBefore : dom.cardInfoAfter;
            infoEl.innerHTML = `
              <div class="loaded-file-badge">
                <span class="file-ok-icon">✅</span>
                <div class="file-meta">
                  <strong class="file-name-text">${state.tracks[mode].name}</strong>
                  <span class="file-sub-text">Знайдено у папці проекту</span>
                </div>
              </div>
            `;
            dom.fileStatusMsg.innerHTML = `✅ Автоматично знайдено файл <strong>${state.tracks[mode].name}</strong>!`;
          }
        };
        testAudio.src = path;
      }
    }

    probe(candidatesBefore, 'before');
    probe(candidatesAfter, 'after');
  }

  autoProbeLocalFiles();

  // Document click unlock AudioContext
  document.addEventListener('click', function onFirstClick() {
    ensureAudioContext();
    document.removeEventListener('click', onFirstClick);
  }, { once: true });

})();
