const state = {
  speed: 0,
  speedLimit: Number(localStorage.getItem("roadly-speed-limit")) || 50,
  coords: null,
  watchId: null,
  demoTimer: null,
  demoTick: 0,
  tripStartedAt: null,
  previousPosition: null,
  tripDistanceKm: 0,
  musicTimer: null,
  youtubePlayer: null,
  youtubeReady: false,
  youtubeApiPromise: null,
  musicDuration: 0,
  isPlaying: false,
  hasWarned: false,
};

const elements = {
  clock: document.querySelector("#clock"),
  gpsDot: document.querySelector("#gps-dot"),
  gpsLabel: document.querySelector("#gps-label"),
  startDrive: document.querySelector("#start-drive"),
  locateButton: document.querySelector("#locate-button"),
  routeForm: document.querySelector("#route-form"),
  destination: document.querySelector("#destination"),
  googleMapFrame: document.querySelector("#google-map-frame"),
  mapStatus: document.querySelector("#map-status"),
  openMapsLink: document.querySelector("#open-maps-link"),
  speedValue: document.querySelector("#speed-value"),
  speedProgress: document.querySelector("#speed-progress"),
  speedometer: document.querySelector("#speedometer"),
  speedLimit: document.querySelector("#speed-limit"),
  speedAlert: document.querySelector("#speed-alert"),
  speedSource: document.querySelector("#speed-source"),
  tripDistance: document.querySelector("#trip-distance"),
  tripTime: document.querySelector("#trip-time"),
  demoToggle: document.querySelector("#demo-toggle"),
  settingsDialog: document.querySelector("#settings-dialog"),
  speedWarningToggle: document.querySelector("#speed-warning-toggle"),
  vibrationToggle: document.querySelector("#vibration-toggle"),
  defaultLimit: document.querySelector("#default-limit"),
  playToggle: document.querySelector("#play-toggle"),
  previousTrack: document.querySelector("#previous-track"),
  nextTrack: document.querySelector("#next-track"),
  trackProgress: document.querySelector("#track-progress"),
  elapsedTime: document.querySelector("#elapsed-time"),
  durationTime: document.querySelector("#duration-time"),
  musicTitle: document.querySelector("#music-title"),
  artistName: document.querySelector("#artist-name"),
  volume: document.querySelector("#volume"),
  musicPanel: document.querySelector("#music-panel"),
  albumArt: document.querySelector("#album-art"),
  connectMusic: document.querySelector("#connect-music"),
  musicDialog: document.querySelector("#music-dialog"),
  closeMusicDialog: document.querySelector("#close-music-dialog"),
  youtubeForm: document.querySelector("#youtube-form"),
  youtubeUrl: document.querySelector("#youtube-url"),
  musicFormError: document.querySelector("#music-form-error"),
  youtubePlayerShell: document.querySelector("#youtube-player-shell"),
  voiceAction: document.querySelector("#voice-action"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

function init() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  } else {
    window.addEventListener("load", () => window.lucide?.createIcons({ attrs: { "stroke-width": 2 } }));
  }

  elements.speedLimit.textContent = state.speedLimit;
  elements.defaultLimit.value = String(state.speedLimit);
  updateClock();
  prepareSavedMusic();
  updateSpeed(0);
  bindEvents();

  setInterval(updateClock, 1000);
  setInterval(updateTripTime, 1000);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function bindEvents() {
  elements.startDrive.addEventListener("click", startGps);
  elements.locateButton.addEventListener("click", startGps);
  elements.demoToggle.addEventListener("click", toggleDemo);
  elements.routeForm.addEventListener("submit", openRoute);

  document.querySelectorAll("[data-limit-step]").forEach((button) => {
    button.addEventListener("click", () => setSpeedLimit(state.speedLimit + Number(button.dataset.limitStep)));
  });

  document.querySelector("#limit-sign").addEventListener("click", () => {
    const limits = [30, 50, 70, 90, 110, 130];
    const next = limits[(limits.indexOf(state.speedLimit) + 1) % limits.length] || 50;
    setSpeedLimit(next);
  });

  document.querySelectorAll("[data-open-settings]").forEach((button) => {
    button.addEventListener("click", () => elements.settingsDialog.showModal());
  });

  elements.defaultLimit.addEventListener("change", () => setSpeedLimit(Number(elements.defaultLimit.value)));
  elements.speedWarningToggle.addEventListener("change", () => updateSpeed(state.speed));
  elements.connectMusic.addEventListener("click", openMusicDialog);
  elements.closeMusicDialog.addEventListener("click", () => elements.musicDialog.close());
  elements.youtubeForm.addEventListener("submit", handleYoutubeSubmit);
  elements.playToggle.addEventListener("click", togglePlayback);
  elements.previousTrack.addEventListener("click", () => controlPlaylist("previous"));
  elements.nextTrack.addEventListener("click", () => controlPlaylist("next"));
  elements.trackProgress.addEventListener("change", seekYoutubeTrack);
  elements.volume.addEventListener("input", updateYoutubeVolume);

  elements.voiceAction.addEventListener("click", startVoiceSearch);

  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(`#${button.dataset.target}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveNavigation(button.dataset.target);
    });
  });
}

function updateClock() {
  elements.clock.textContent = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function startGps() {
  if (!navigator.geolocation) {
    showToast("Геолокація не підтримується цим браузером");
    return;
  }

  stopDemo();
  elements.gpsLabel.textContent = "Пошук GPS-сигналу…";
  elements.startDrive.disabled = true;

  if (!state.tripStartedAt) state.tripStartedAt = Date.now();
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);

  state.watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 12000,
  });
}

function handlePosition(position) {
  const { latitude, longitude, speed, accuracy } = position.coords;
  const isFirstFix = state.coords === null;
  state.coords = { latitude, longitude };
  elements.startDrive.disabled = false;
  elements.startDrive.querySelector("span").textContent = "GPS активний";
  elements.gpsDot.classList.add("is-live");
  elements.gpsLabel.textContent = `GPS ±${Math.round(accuracy)} м`;

  const nextSpeed = Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : 0;
  updateSpeed(nextSpeed);
  updateTripDistance(latitude, longitude);

  if (isFirstFix) {
    showPositionOnMap(latitude, longitude, accuracy);
  }
}

function handlePositionError(error) {
  elements.startDrive.disabled = false;
  elements.gpsDot.classList.remove("is-live");
  const messages = {
    1: "Дозвольте доступ до геолокації в браузері",
    2: "GPS-сигнал зараз недоступний",
    3: "GPS не відповів. Спробуйте ще раз",
  };
  elements.gpsLabel.textContent = "GPS неактивний";
  showToast(messages[error.code] || "Не вдалося отримати геолокацію");
}

function updateSpeed(rawSpeed) {
  state.speed = Math.max(0, Math.min(240, rawSpeed));
  const rounded = Math.round(state.speed);
  const circumference = 666;
  const progress = Math.min(state.speed / 180, 1);
  elements.speedValue.textContent = rounded;
  elements.speedProgress.style.strokeDashoffset = String(circumference - circumference * progress);

  const isOver = rounded > state.speedLimit;
  elements.speedometer.classList.toggle("is-over", isOver);
  elements.speedAlert.hidden = !(isOver && elements.speedWarningToggle.checked);

  if (isOver && !state.hasWarned && elements.speedWarningToggle.checked) {
    state.hasWarned = true;
    if (elements.vibrationToggle.checked && navigator.vibrate) navigator.vibrate(180);
  }

  if (!isOver) state.hasWarned = false;
}

function setSpeedLimit(value) {
  state.speedLimit = Math.max(20, Math.min(130, Math.round(value / 10) * 10));
  elements.speedLimit.textContent = state.speedLimit;
  elements.defaultLimit.value = String(state.speedLimit);
  localStorage.setItem("roadly-speed-limit", String(state.speedLimit));
  updateSpeed(state.speed);
}

function toggleDemo() {
  if (state.demoTimer) {
    stopDemo();
    updateSpeed(0);
    elements.gpsLabel.textContent = "GPS очікує дозволу";
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  if (!state.tripStartedAt) state.tripStartedAt = Date.now();
  state.demoTick = 0;
  elements.demoToggle.setAttribute("aria-pressed", "true");
  elements.speedSource.textContent = "DEMO";
  elements.speedSource.classList.add("is-demo");
  elements.gpsDot.classList.add("is-live");
  elements.gpsLabel.textContent = "Демонстраційний режим";
  showToast("Демо увімкнено — значення швидкості не є даними GPS");

  const pattern = [0, 8, 18, 31, 44, 52, 59, 66, 72, 64, 55, 47, 38, 25, 12, 0];
  state.demoTimer = window.setInterval(() => {
    updateSpeed(pattern[state.demoTick % pattern.length]);
    state.demoTick += 1;
  }, 850);
  updateSpeed(pattern[0]);
}

function stopDemo() {
  if (!state.demoTimer) return;
  clearInterval(state.demoTimer);
  state.demoTimer = null;
  elements.demoToggle.setAttribute("aria-pressed", "false");
  elements.speedSource.textContent = "GPS";
  elements.speedSource.classList.remove("is-demo");
}

function openRoute(event) {
  event.preventDefault();
  const destination = elements.destination.value.trim();
  if (!destination) return;

  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (state.coords) params.set("origin", `${state.coords.latitude},${state.coords.longitude}`);
  elements.openMapsLink.href = `https://www.google.com/maps/dir/?${params.toString()}`;
  elements.googleMapFrame.src = googleMapEmbedUrl(destination, 15);
  elements.mapStatus.querySelector("strong").textContent = "Пункт призначення";
  elements.mapStatus.querySelector("span").textContent = destination;
  showToast("Карту оновлено. Натисніть «Маршрут», щоб запустити навігацію");
}

function googleMapEmbedUrl(query, zoom = 14) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
}

function showPositionOnMap(latitude, longitude, accuracy) {
  const coordinates = `${latitude},${longitude}`;
  elements.googleMapFrame.src = googleMapEmbedUrl(coordinates, 16);
  elements.openMapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
  elements.mapStatus.querySelector("strong").textContent = "Ви тут";
  elements.mapStatus.querySelector("span").textContent = `GPS ±${Math.round(accuracy)} м`;
}

function updateTripDistance(latitude, longitude) {
  const current = { latitude, longitude };
  if (state.previousPosition) {
    const delta = haversineKm(state.previousPosition, current);
    if (delta < 0.5) state.tripDistanceKm += delta;
  }
  state.previousPosition = current;
  elements.tripDistance.textContent = `${state.tripDistanceKm.toFixed(1).replace(".", ",")} км`;
}

function haversineKm(a, b) {
  const radius = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function updateTripTime() {
  if (!state.tripStartedAt) return;
  const seconds = Math.floor((Date.now() - state.tripStartedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  elements.tripTime.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function prepareSavedMusic() {
  const savedUrl = localStorage.getItem("roadly-youtube-url");
  if (savedUrl) {
    elements.youtubeUrl.value = savedUrl;
    elements.musicTitle.textContent = "Збережене посилання";
    elements.artistName.textContent = "Натисніть «Підключити»";
  }
  updateTrackDisplay(0, 0);
}

function openMusicDialog() {
  elements.musicFormError.hidden = true;
  elements.musicDialog.showModal();
  elements.youtubeUrl.focus();
}

async function handleYoutubeSubmit(event) {
  event.preventDefault();
  elements.musicFormError.hidden = true;

  try {
    const config = parseYoutubeUrl(elements.youtubeUrl.value.trim());
    elements.artistName.textContent = "Підключення…";
    await connectYoutubeMusic(config);
    localStorage.setItem("roadly-youtube-url", elements.youtubeUrl.value.trim());
    elements.musicDialog.close();
    showToast("YouTube Music підключено. Натисніть Play, якщо відтворення не почалося автоматично");
  } catch (error) {
    elements.musicFormError.textContent = error.message || "Не вдалося підключити це посилання";
    elements.musicFormError.hidden = false;
  }
}

function parseYoutubeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Вставте повне посилання YouTube Music");
  }

  const host = url.hostname.replace(/^www\./, "");
  const allowedHosts = ["music.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"];
  if (!allowedHosts.includes(host)) {
    throw new Error("Підтримуються посилання YouTube Music або YouTube");
  }

  let videoId = url.searchParams.get("v");
  if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || null;
  if (!videoId && /\/(shorts|embed)\//.test(url.pathname)) {
    videoId = url.pathname.split("/").filter(Boolean)[1] || null;
  }

  const playlistId = url.searchParams.get("list");
  if (!videoId && !playlistId) {
    throw new Error("У посиланні не знайдено трек або плейлист");
  }

  return { videoId, playlistId };
}

function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (state.youtubeApiPromise) return state.youtubeApiPromise;

  state.youtubeApiPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("YouTube не відповідає. Перевірте інтернет-з’єднання")), 15000);
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      clearTimeout(timeout);
      resolve(window.YT);
    };

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Не вдалося завантажити YouTube Player"));
      });
      document.head.append(script);
    }
  });

  state.youtubeApiPromise.catch(() => {
    state.youtubeApiPromise = null;
  });

  return state.youtubeApiPromise;
}

async function connectYoutubeMusic(config) {
  await loadYoutubeApi();
  elements.youtubePlayerShell.hidden = false;
  elements.albumArt.classList.add("is-connected");
  elements.musicPanel.classList.add("has-youtube");
  state.youtubeReady = false;

  if (state.youtubePlayer?.loadVideoById) {
    if (config.playlistId) {
      state.youtubePlayer.loadPlaylist({ list: config.playlistId, index: 0, startSeconds: 0 });
    } else {
      state.youtubePlayer.loadVideoById(config.videoId);
    }
    return;
  }

  const playerVars = {
    autoplay: 1,
    controls: 1,
    playsinline: 1,
    rel: 0,
    origin: window.location.origin,
  };

  if (config.playlistId) {
    playerVars.listType = "playlist";
    playerVars.list = config.playlistId;
  }

  const playerOptions = {
    width: "100%",
    height: "100%",
    playerVars,
    events: {
      onReady: handleYoutubeReady,
      onStateChange: handleYoutubeState,
      onError: handleYoutubeError,
    },
  };

  if (config.videoId) playerOptions.videoId = config.videoId;
  state.youtubePlayer = new window.YT.Player("youtube-player", playerOptions);
}

function handleYoutubeReady(event) {
  state.youtubeReady = true;
  event.target.setVolume(Number(elements.volume.value));
  event.target.playVideo();
  startYoutubeSync();
  syncYoutubeProgress();
}

function handleYoutubeState(event) {
  const playing = event.data === window.YT.PlayerState.PLAYING;
  const paused = event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED;
  if (playing || paused) setMusicPlaying(playing);
  syncYoutubeProgress();
}

function handleYoutubeError() {
  setMusicPlaying(false);
  elements.artistName.textContent = "Вбудовування цього треку заборонено";
  showToast("Цей трек не дозволяє відтворення на сторонньому сайті. Відкрийте його в YouTube Music");
}

function togglePlayback() {
  if (!state.youtubeReady) {
    openMusicDialog();
    return;
  }

  if (state.isPlaying) state.youtubePlayer.pauseVideo();
  else {
    state.youtubePlayer.playVideo();
    window.setTimeout(() => {
      if (state.isPlaying) return;
      showToast("Якщо браузер блокує запуск, натисніть ▶ у самому YouTube-плеєрі");
    }, 900);
  }
}

function setMusicPlaying(playing) {
  state.isPlaying = playing;
  elements.playToggle.setAttribute("aria-pressed", String(playing));
  elements.playToggle.setAttribute("aria-label", playing ? "Пауза" : "Відтворити");
  elements.playToggle.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}" aria-hidden="true"></i>`;
  window.lucide?.createIcons({ attrs: { "stroke-width": 2 } });
}

function controlPlaylist(direction) {
  if (!state.youtubeReady) {
    openMusicDialog();
    return;
  }

  if (direction === "next") state.youtubePlayer.nextVideo();
  else state.youtubePlayer.previousVideo();
  window.setTimeout(syncYoutubeProgress, 350);
}

function seekYoutubeTrack() {
  if (!state.youtubeReady || !state.musicDuration) return;
  const seconds = (Number(elements.trackProgress.value) / 100) * state.musicDuration;
  state.youtubePlayer.seekTo(seconds, true);
}

function updateYoutubeVolume() {
  if (state.youtubeReady) state.youtubePlayer.setVolume(Number(elements.volume.value));
}

function startYoutubeSync() {
  clearInterval(state.musicTimer);
  state.musicTimer = window.setInterval(syncYoutubeProgress, 1000);
}

function syncYoutubeProgress() {
  if (!state.youtubeReady) return;

  const duration = Number(state.youtubePlayer.getDuration?.()) || 0;
  const current = Number(state.youtubePlayer.getCurrentTime?.()) || 0;
  state.musicDuration = duration;
  updateTrackDisplay(current, duration);

  const videoData = state.youtubePlayer.getVideoData?.() || {};
  if (videoData.title) elements.musicTitle.textContent = videoData.title;
  elements.artistName.textContent = videoData.author || "YouTube Music";

  if (videoData.title && "mediaSession" in navigator && "MediaMetadata" in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: videoData.title,
      artist: videoData.author || "YouTube Music",
      album: "Roadly",
    });
  }
}

function updateTrackDisplay(current, duration) {
  const progress = duration > 0 ? (current / duration) * 100 : 0;
  elements.trackProgress.value = String(Math.max(0, Math.min(100, progress)));
  elements.elapsedTime.textContent = formatTime(current);
  elements.durationTime.textContent = formatTime(duration);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function startVoiceSearch() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.destination.focus();
    showToast("Голосовий ввід не підтримується — введіть адресу вручну");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "uk-UA";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.addEventListener("start", () => showToast("Слухаю… назвіть пункт призначення"));
  recognition.addEventListener("result", (event) => {
    elements.destination.value = event.results[0][0].transcript;
    elements.destination.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  recognition.addEventListener("error", () => showToast("Не вдалося розпізнати голос"));
  recognition.start();
}

function setActiveNavigation(target) {
  document.querySelectorAll("[data-target]").forEach((item) => {
    const active = item.dataset.target === target;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

init();
