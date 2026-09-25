/**
 * Bộ phát âm thanh thông báo và chuông nhắc nhở chuẩn Web Audio API + HTML5 Audio fallback
 * Đảm bảo phát chuông báo rõ ràng trên mọi thiết bị (máy tính, điện thoại Android, iPhone Safari)
 * Tự động mở khóa (unlock) âm thanh khi người dùng chạm/click vào màn hình
 */

// Key lưu cài đặt bật/tắt âm thanh trong localStorage
const SOUND_ENABLED_STORAGE_KEY = 'sso_attendance_sound_alert_enabled';

let sharedAudioContext: AudioContext | null = null;
let cachedWavDataUri: string | null = null;
let isAudioBlockedByAutoplay = false;
let hasPendingChime = false;
const audioStateListeners = new Set<() => void>();

function notifyAudioStateChange() {
  audioStateListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('Audio listener error:', e);
    }
  });
}

/**
 * Kiểm tra xem người dùng có đang bật âm thanh nhắc nhở không (mặc định: BẬT - true)
 */
export function isSoundAlertEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
  if (stored === null) return true; // Mặc định bật
  return stored === 'true';
}

/**
 * Bật hoặc tắt âm thanh nhắc nhở
 */
export function setSoundAlertEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  notifyAudioStateChange();
}

/**
 * Kiểm tra xem trình duyệt có đang chặn autoplay âm thanh không
 */
export function isAudioAutoplayBlocked(): boolean {
  return isAudioBlockedByAutoplay;
}

/**
 * Lắng nghe thay đổi trạng thái âm thanh
 */
export function subscribeAudioState(callback: () => void): () => void {
  audioStateListeners.add(callback);
  return () => {
    audioStateListeners.delete(callback);
  };
}

/**
 * Khởi tạo hoặc lấy đối tượng AudioContext dùng chung
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new AudioContextClass();
    } catch (err) {
      console.warn('Could not initialize AudioContext:', err);
    }
  }

  return sharedAudioContext;
}

/**
 * Tự động mở khóa AudioContext ngay khi người dùng chạm hoặc nhấp chuột lần đầu vào trang trên điện thoại hoặc máy tính
 */
function initAutoplayUnlocker() {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        isAudioBlockedByAutoplay = false;
        notifyAudioStateChange();
        if (hasPendingChime) {
          hasPendingChime = false;
          playNotificationChime({ force: false });
        }
      }).catch(() => {});
    } else {
      isAudioBlockedByAutoplay = false;
      notifyAudioStateChange();
      if (hasPendingChime) {
        hasPendingChime = false;
        playNotificationChime({ force: false });
      }
    }

    // Giữ lại các listener nhẹ nhàng nếu cần hoặc loại bỏ sau khi đã resume thành công
  };

  ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown', 'scroll', 'visibilitychange'].forEach((ev) => {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener(ev, unlock, { capture: true, passive: true });
  });
}

// Kích hoạt unlocker khi import
if (typeof window !== 'undefined') {
  initAutoplayUnlocker();
}

/**
 * Tạo dữ liệu âm thanh chuông 3 nốt nhạc (E5 - G#5 - B5) ngân vang dạng WAV Data URI
 * Dùng làm fallback khi AudioContext bị chặn hoặc trên trình duyệt di động
 */
export function getChimeWavDataUri(): string {
  if (cachedWavDataUri) return cachedWavDataUri;

  const sampleRate = 22050;
  const duration = 1.0; // 1 giây
  const totalSamples = Math.floor(sampleRate * duration);
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Helper ghi chuỗi ASCII
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 cho PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 cho PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Tổng hợp chuông 3 nốt: E5 (659.25Hz), G#5 (830.61Hz), B5 (987.77Hz)
  const notes = [
    { freq: 659.25, start: 0.0, dur: 0.35, amp: 0.4 },
    { freq: 830.61, start: 0.15, dur: 0.45, amp: 0.45 },
    { freq: 987.77, start: 0.32, dur: 0.65, amp: 0.55 },
  ];

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    for (const note of notes) {
      if (t >= note.start && t < note.start + note.dur) {
        const noteTime = t - note.start;
        // Exponential decay envelope
        const envelope = Math.exp(-noteTime * 4.5);
        // Fundamental sine wave + subtle harmonic overtone (chuông ngân)
        const wave = Math.sin(2 * Math.PI * note.freq * noteTime) * 0.8 +
                     Math.sin(2 * Math.PI * note.freq * 2 * noteTime) * 0.2;
        sample += wave * envelope * note.amp;
      }
    }

    // Kẹp biên độ để tránh vỡ tiếng (clipping)
    sample = Math.max(-1, Math.min(1, sample));
    const intSample = sample < 0 ? sample * 32768 : sample * 32767;
    view.setInt16(offset, Math.floor(intSample), true);
    offset += 2;
  }

  // Chuyển sang base64 Data URI
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  cachedWavDataUri = `data:audio/wav;base64,${base64}`;
  return cachedWavDataUri;
}

/**
 * Phát chuông báo động nhắc nhở (kèm rung điện thoại di động)
 * @param options.force Nếu là true, bỏ qua kiểm tra cài đặt âm thanh (dùng khi bấm nút "Thử chuông")
 */
export async function playNotificationChime(options: { force?: boolean } = {}): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const isEnabled = isSoundAlertEnabled();
  if (!options.force && !isEnabled) {
    return false;
  }

  let playedSuccessfully = false;

  // 1. Rung thiết bị di động (Vibration API)
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate([250, 100, 250, 100, 450]);
    }
  } catch (err) {
    // Không ảnh hưởng
  }

  // 2. Phát âm thanh qua Web Audio API (Chất âm ngân vang cao cấp nhất)
  const ctx = getSharedAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (ctx.state === 'running') {
        const now = ctx.currentTime;

        const playTone = (freq: number, startTime: number, duration: number, maxGain: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);

          // Envelope mượt mà chống nổ tiếng
          gain.gain.setValueAtTime(0.001, startTime);
          gain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + duration);
        };

        // Nốt 1: E5 (659.25Hz)
        playTone(659.25, now, 0.35, 0.28);
        // Nốt 2: G#5 (830.61Hz)
        playTone(830.61, now + 0.15, 0.45, 0.32);
        // Nốt 3: B5 (987.77Hz) - ngân vang kết thúc
        playTone(987.77, now + 0.32, 0.85, 0.35);

        playedSuccessfully = true;
        isAudioBlockedByAutoplay = false;
        notifyAudioStateChange();
      }
    } catch (err) {
      console.warn('Web Audio playback error:', err);
    }
  }

  // 3. Fallback bằng HTML5 Audio element nếu Web Audio API chưa chạy được
  if (!playedSuccessfully) {
    try {
      const wavUri = getChimeWavDataUri();
      const audio = new Audio(wavUri);
      audio.volume = 0.9;
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        await playPromise;
        playedSuccessfully = true;
        isAudioBlockedByAutoplay = false;
        notifyAudioStateChange();
      }
    } catch (err: any) {
      // Trình duyệt chặn autoplay do người dùng chưa chạm vào trang
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        isAudioBlockedByAutoplay = true;
        hasPendingChime = true;
        notifyAudioStateChange();
      }
    }
  }

  // Tránh phát chuông lặp đè lên nhau trong khoảng 1.5 giây
  const nowMs = Date.now();
  if (!options.force && nowMs - lastChimeTimestamp < 1500) {
    return true;
  }
  lastChimeTimestamp = nowMs;

  return playedSuccessfully;
}

let lastChimeTimestamp = 0;
let documentTitleAlertInterval: any = null;
let originalPageTitle: string = '';

/**
 * Hiệu ứng nhấp nháy tiêu đề tab trình duyệt khi có cảnh báo điểm danh khẩn cấp
 * Giúp GVCN dù đang mở tab khác hay thu nhỏ cửa sổ vẫn thấy tín hiệu cảnh báo trên thanh tác vụ/tiêu đề tab
 */
export function startDocumentTitleAlert(alertText: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!originalPageTitle) {
    originalPageTitle = document.title;
  }
  stopDocumentTitleAlert();

  let toggle = false;
  documentTitleAlertInterval = setInterval(() => {
    document.title = toggle ? `🔔 ${alertText}` : `⚠️ [CẢNH BÁO SĨ SỐ] ${alertText}`;
    toggle = !toggle;
  }, 1000);
}

/**
 * Dừng nhấp nháy tiêu đề tab và trả lại tiêu đề ban đầu
 */
export function stopDocumentTitleAlert() {
  if (documentTitleAlertInterval) {
    clearInterval(documentTitleAlertInterval);
    documentTitleAlertInterval = null;
  }
  if (originalPageTitle && typeof document !== 'undefined') {
    document.title = originalPageTitle;
  }
}

/**
 * Hiển thị thông báo bật ra ngoài màn hình (Desktop Notification / Service Worker Notification)
 * Dù người dùng đang thu nhỏ trình duyệt, đang mở Word/Excel/Zalo hay ở màn hình khóa điện thoại
 */
export async function showScreenAlert(options: {
  title: string;
  body: string;
  actionUrl?: string;
  vibrate?: number[];
}): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const { title, body, actionUrl = '/attendance', vibrate = [350, 150, 350, 150, 500] } = options;

  // 1. Rung thiết bị điện thoại
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(vibrate);
    }
  } catch (e) {}

  // 2. Thông báo qua Service Worker (hiệu quả nhất trên di động Android và PWA chạy nền)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'sso_attendance_urgent_screen_alert',
          requireInteraction: true,
          renotify: true,
          vibrate,
          data: { actionUrl },
        } as NotificationOptions);
        return true;
      }
    } catch (err) {
      console.warn('Service worker showNotification error:', err);
    }
  }

  // 3. Fallback qua Web Notification API chuẩn trên Desktop (Chrome, Edge, Safari, Firefox)
  try {
    if ('Notification' in window && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'sso_attendance_urgent_screen_alert',
          requireInteraction: true,
        });

        notif.onclick = () => {
          try {
            window.focus();
            if (actionUrl) {
              window.location.hash = actionUrl;
            }
          } catch (e) {}
        };
        return true;
      }
    }
  } catch (err) {
    console.warn('Web Notification error:', err);
  }

  return false;
}

/**
 * Yêu cầu quyền gửi thông báo ra ngoài màn hình của trình duyệt
 */
export async function requestScreenNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined') return 'unsupported';
  try {
    if ('Notification' in window && typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
      const perm = await Notification.requestPermission();
      return perm;
    }
  } catch (e) {
    console.warn('Request notification permission error:', e);
  }
  return 'unsupported';
}

/**
 * Thử chuông báo ngay lập tức (dùng cho nút Bấm thử chuông)
 * Thao tác này là user gesture nên 100% được trình duyệt cho phép phát và mở khóa AudioContext
 */
export async function testNotificationChime(): Promise<boolean> {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {}
  }
  isAudioBlockedByAutoplay = false;
  hasPendingChime = false;
  notifyAudioStateChange();
  return playNotificationChime({ force: true });
}

