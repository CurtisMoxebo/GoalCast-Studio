import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';

export class TeamLogoService {
  private localLogosDir: string;
  private cacheDir: string;
  private memoryCache: Map<string, string> = new Map();
  private geminiClient: GoogleGenAI | null = null;

  constructor() {
    this.localLogosDir = path.resolve(__dirname, '../../../assets/logos');
    this.cacheDir = path.join(this.localLogosDir, 'cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'dummy_gemini_api_key_for_build_testing' && apiKey.length > 10) {
      this.geminiClient = new GoogleGenAI({ apiKey });
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
   * Query Gemini for team logo URL if not in dictionary
   */
  private async queryGeminiForLogoUrl(teamName: string): Promise<string | null> {
    if (!this.geminiClient) return null;

    try {
      const response = await this.geminiClient.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
        contents: `What is the direct transparent SVG or PNG logo URL on Wikimedia Commons or FotMob for the football club "${teamName}"? Reply ONLY with the direct HTTPS URL, without markdown formatting or quotes.`
      });

      const text = (response.text || '').trim();
      if (text.startsWith('http://') || text.startsWith('https://')) {
        return text;
      }
    } catch (e: any) {
      console.warn(`[TeamLogoService] Gemini logo lookup error for "${teamName}":`, e.message);
    }
    return null;
  }

  /**
   * Fetch image buffer from a URL with timeout and appropriate User-Agent
   */
  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'GoalCastStudio/1.0 (contact@goalcast.studio)'
        }
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        console.warn(`[TeamLogoService] Failed to fetch image ${url}: HTTP ${resp.status}`);
        return null;
      }

      const ab = await resp.arrayBuffer();
      return Buffer.from(ab);
    } catch (e: any) {
      console.warn(`[TeamLogoService] Error fetching image ${url}:`, e.message);
      return null;
    }
  }

  /**
   * Fallback vector crest shield data URI if image fetch fails
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
      // 1. Determine target URL (from customUrl provided by AI or query AI directly)
      let targetUrl: string | undefined = customUrl && (customUrl.startsWith('http://') || customUrl.startsWith('https://'))
        ? customUrl
        : undefined;

      // 2. If no custom URL was provided, query Gemini for the logo URL
      if (!targetUrl) {
        targetUrl = (await this.queryGeminiForLogoUrl(teamName)) || undefined;
      }

      // 3. If we have a URL, fetch and rasterize
      if (targetUrl) {
        const safeFilename = Buffer.from(targetUrl).toString('base64url').slice(0, 48) + '.png';
        const cachedPath = path.join(this.cacheDir, safeFilename);

        let imgBuffer: Buffer | null = null;
        if (fs.existsSync(cachedPath)) {
          imgBuffer = fs.readFileSync(cachedPath);
        } else {
          imgBuffer = await this.fetchImageBuffer(targetUrl);
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
      }
    } catch (e: any) {
      console.warn(`[TeamLogoService] Error rasterizing logo for "${teamName}":`, e.message);
    }

    // 5. Fallback vector shield
    const fallbackUri = await this.getFallbackShieldDataUri(teamName, size);
    this.memoryCache.set(cacheKey, fallbackUri);
    return fallbackUri;
  }
}

export const teamLogoService = new TeamLogoService();
