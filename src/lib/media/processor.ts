import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'optimizing' | 'ready' | 'error';
export type Quality = 'original' | 'optimized' | 'preview';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  size: number;
  format: string;
  aspectRatio: string;
}

export interface ProcessingProgress {
  status: ProcessingStatus;
  progress: number;
  message?: string;
  thumbnailUrl?: string;
}

let ffmpegInstance: FFmpeg | null = null;

export async function loadFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  
  const ffmpeg = new FFmpeg();
  
  // Use UNPKG to load the core files avoiding local next.js WASM packaging issues
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
  await ffmpeg.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });
  
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export async function extractMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
      const divisor = gcd(video.videoWidth, video.videoHeight);
      
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        size: file.size,
        format: file.type || file.name.split('.').pop() || 'mp4',
        aspectRatio: `${video.videoWidth / divisor}:${video.videoHeight / divisor}`
      });
    };
    video.onerror = () => reject('Failed to load video metadata');
    video.src = window.URL.createObjectURL(file);
  });
}

export async function generateThumbnail(file: File, seekTime: number = 0): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    video.currentTime = seekTime;
    video.muted = true;
    
    video.onloadeddata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No canvas context');
      
      video.currentTime = Math.min(seekTime, video.duration / 2); // default to middle if not seeked
    };

    video.onseeked = () => {
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('Thumbnail creation failed');
      }, 'image/jpeg', 0.85);
    };

    video.onerror = () => reject('Failed to load video');
    video.src = window.URL.createObjectURL(file);
    video.load();
  });
}

export async function processVideo(
  file: File, 
  platform: 'instagram' | 'tiktok' | 'snapchat' | 'google_ads',
  onProgress: (prog: ProcessingProgress) => void
): Promise<{ optimized: File, preview: File }> {
  
  onProgress({ status: 'processing', progress: 5, message: 'Loading media engine...' });
  const ffmpeg = await loadFFmpeg();
  
  const inputName = 'input_' + file.name;
  const optimizedName = 'optimized_' + file.name.replace(/\.[^/.]+$/, "") + '.mp4';
  const previewName = 'preview_' + file.name.replace(/\.[^/.]+$/, "") + '.mp4';
  
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Determine Platform Operations
  let scaleFilter = '';
  // Force 9:16 vertical target format if intended for mobile
  if (platform === 'instagram' || platform === 'tiktok' || platform === 'snapchat') {
    // Crop & Pad to 9:16 safely using scale and pad: scale to fit width, then pad height
    scaleFilter = '-vf scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black';
  } else {
    // Google Ads or General (Scale down to 1080p if larger)
    scaleFilter = "-vf scale='w=min(1920,iw):h=min(1080,ih):force_original_aspect_ratio=decrease'";
  }

  // Optimize (High Quality, compressed)
  onProgress({ status: 'optimizing', progress: 10, message: 'Generating HQ Optimized Target...' });
  
  // Set progress listener
  ffmpeg.on('progress', ({ progress }) => {
    onProgress({ status: 'optimizing', progress: 10 + Math.round(progress * 40), message: 'Transcoding High-Quality...' });
  });

  await ffmpeg.exec([
    '-i', inputName,
    ...scaleFilter.split(' '),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '26', // Balance between quality and size (significant reduction)
    '-c:a', 'aac',
    '-b:a', '128k',
    optimizedName
  ]);

  // Preview (Extremely lightweight)
  onProgress({ status: 'optimizing', progress: 50, message: 'Generating Lightning Preview...' });
  ffmpeg.on('progress', ({ progress }) => {
    onProgress({ status: 'optimizing', progress: 50 + Math.round(progress * 40), message: 'Generating Lightning Preview...' });
  });

  await ffmpeg.exec([
    '-i', inputName,
    '-vf', 'scale=480:-2', // Tiny resolution
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '35', // Heavy compression
    '-an', // Mute preview to save size
    previewName
  ]);

  onProgress({ status: 'ready', progress: 95, message: 'Bundling streams...' });

  const optData = await ffmpeg.readFile(optimizedName);
  const prvData = await ffmpeg.readFile(previewName);

  const optimizedFile = new File([optData as any], optimizedName, { type: 'video/mp4' });
  const previewFile = new File([prvData as any], previewName, { type: 'video/mp4' });

  // Clean up
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(optimizedName);
  await ffmpeg.deleteFile(previewName);

  onProgress({ status: 'ready', progress: 100, message: 'Ready' });

  return { optimized: optimizedFile, preview: previewFile };
}
