import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

export class TeamLogoService {
  private localLogosDir: string;
  private cacheDir: string;
  private memoryCache: Map<string, string> = new Map();

  constructor() {
    this.localLogosDir = path.resolve(__dirname, '../../../assets/logos');
    this.cacheDir = path.join(this.localLogosDir, 'cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Normalize team name for cache keys
   */
  private normalizeTeamName(name: string): string {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Fetch image buffer from a URL with timeout and appropriate headers
   */
  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        console.warn(`[TeamLogoService] HTTP ${resp.status} fetching image ${url}`);
        return null;
      }

      const ab = await resp.arrayBuffer();
      if (ab.byteLength < 50) {
        console.warn(`[TeamLogoService] Image response from ${url} was too small (${ab.byteLength} bytes)`);
        return null;
      }
      return Buffer.from(ab);
    } catch (e: any) {
      console.warn(`[TeamLogoService] Network error fetching ${url}:`, e?.message || e);
      return null;
    }
  }

  /**
   * Fetch image buffer with up to 2 retries (3 attempts total) before falling back
   */
  private async fetchImageBufferWithRetry(url: string, retries: number = 2): Promise<Buffer | null> {
    const totalAttempts = 1 + retries;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      console.log(`[TeamLogoService] 🌐 Fetching logo from ${url} (attempt ${attempt}/${totalAttempts})...`);
      const buffer = await this.fetchImageBuffer(url);
      if (buffer) {
        if (attempt > 1) {
          console.log(`[TeamLogoService] ✅ Successfully fetched logo on retry attempt ${attempt}/${totalAttempts}`);
        }
        return buffer;
      }

      if (attempt < totalAttempts) {
        console.warn(`[TeamLogoService] ⚠️ Attempt ${attempt} failed for ${url}. Retrying in 300ms...`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    console.warn(`[TeamLogoService] ❌ Failed to fetch logo after ${totalAttempts} attempts from ${url}. Using default shield.`);
    return null;
  }

  /**
   * Fallback vector crest shield data URI if image fetch fails or no URL provided
   */
  private async getFallbackShieldDataUri(teamName: string, size: number): Promise<string> {
    const rawInitials = (teamName || '')
      .split(' ')
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length > 0)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');

    const initials = rawInitials.length > 0 ? rawInitials : 'FC';

    const half = size / 2;
    const fontSize = Math.round(size * 0.38);

    const svg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="${Math.round(size * 0.24)}" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
        <circle cx="${half}" cy="${half}" r="${Math.round(size * 0.36)}" fill="#38bdf8" fill-opacity="0.18"/>
        <text x="${half}" y="${Math.round(half + fontSize * 0.36)}" fill="#ffffff" font-size="${fontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">${initials}</text>
      </svg>
    `;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  /**
   * Get team logo as a Base64 PNG data URI for embedding in SVGs
   */
  async getLogoDataUri(
    teamName: string,
    customUrl?: string,
    size: number = 80
  ): Promise<string> {
    const normalized = this.normalizeTeamName(teamName);
    const cacheKey = `${normalized}_${size}_${customUrl || ''}`;

    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    try {
      // 1. Directly use provided logo URL
      const targetUrl =
        customUrl && (customUrl.startsWith('http://') || customUrl.startsWith('https://'))
          ? customUrl
          : undefined;

      if (targetUrl) {
        console.log(`[TeamLogoService] 🎯 Using provided logo URL for "${teamName}": ${targetUrl}`);
        const safeFilename = crypto.createHash('sha256').update(targetUrl).digest('hex') + '.png';
        const cachedPath = path.join(this.cacheDir, safeFilename);

        let imgBuffer: Buffer | null = null;
        if (fs.existsSync(cachedPath)) {
          imgBuffer = fs.readFileSync(cachedPath);
        } else {
          // Fetch from URL with 2 retries (3 attempts total)
          imgBuffer = await this.fetchImageBufferWithRetry(targetUrl, 2);
          if (imgBuffer) {
            try {
              fs.writeFileSync(cachedPath, imgBuffer);
            } catch {}
          }
        }

        if (imgBuffer) {
          const pngBuf = await sharp(imgBuffer)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          const uri = `data:image/png;base64,${pngBuf.toString('base64')}`;
          this.memoryCache.set(cacheKey, uri);
          return uri;
        }
      } else {
        console.log(`[TeamLogoService] ℹ No URL provided for "${teamName}". Using default shield.`);
      }
    } catch (e: any) {
      console.warn(`[TeamLogoService] Error rasterizing logo for "${teamName}":`, e?.message || e);
    }

    // 2. Fallback to default vector crest shield
    const fallbackUri = await this.getFallbackShieldDataUri(teamName, size);
    this.memoryCache.set(cacheKey, fallbackUri);
    return fallbackUri;
  }
}

export const teamLogoService = new TeamLogoService();
