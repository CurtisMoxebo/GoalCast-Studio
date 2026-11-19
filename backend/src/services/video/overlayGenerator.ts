import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export interface OverlayGameData {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffTime: string;
  selections?: { code: string; label: string; spokenText: string }[];
}

export class OverlayGenerator {
  /**
   * Escape XML/SVG special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  /**
   * Generate Introduction Table SVG / PNG (1080x1920 vertical canvas)
   */
  async generateTableOverlay(
    games: OverlayGameData[],
    dateFormatted: string,
    outputPath: string
  ): Promise<string> {
    const tableRows = games
      .slice(0, 8)
      .map((game, i) => {
        const yPos = 480 + i * 140;
        const home = this.escapeXml(game.homeTeam);
        const away = this.escapeXml(game.awayTeam);
        const comp = this.escapeXml(game.competition);
        const time = new Date(game.kickoffTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        return `
        <g transform="translate(60, ${yPos})">
          <!-- Row container -->
          <rect width="960" height="120" rx="20" fill="#0f172a" fill-opacity="0.85" stroke="#334155" stroke-width="2"/>
          <circle cx="50" cy="60" r="28" fill="#3b82f6" fill-opacity="0.2"/>
          <text x="50" y="68" fill="#60a5fa" font-size="28" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${i + 1}</text>
          
          <!-- Home vs Away -->
          <text x="110" y="52" fill="#f8fafc" font-size="30" font-weight="bold" font-family="Arial, sans-serif">${home}</text>
          <text x="110" y="90" fill="#94a3b8" font-size="24" font-family="Arial, sans-serif">vs ${away}</text>
          
          <!-- Comp & Time Badge -->
          <rect x="730" y="25" width="200" height="70" rx="14" fill="#1e293b"/>
          <text x="830" y="54" fill="#38bdf8" font-size="20" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${comp}</text>
          <text x="830" y="80" fill="#f1f5f9" font-size="22" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${time}</text>
        </g>
      `;
      })
      .join('\n');

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="100%" stop-color="#1d4ed8"/>
          </linearGradient>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6"/>
          </filter>
        </defs>

        <!-- Main Card Container -->
        <g filter="url(#shadow)">
          <rect x="30" y="180" width="1020" height="1560" rx="36" fill="#020617" fill-opacity="0.88" stroke="#1e293b" stroke-width="3"/>
          
          <!-- Header Banner -->
          <rect x="60" y="220" width="960" height="200" rx="28" fill="url(#headerGrad)"/>
          <text x="540" y="300" fill="#ffffff" font-size="52" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">TODAY'S TOP PICKS ⚽</text>
          <text x="540" y="370" fill="#dbeafe" font-size="32" font-weight="600" font-family="Arial, sans-serif" text-anchor="middle">${this.escapeXml(dateFormatted)}</text>
          
          <!-- Rows -->
          ${tableRows}
        </g>
      </svg>
    `;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }

  /**
   * Generate Celebration Table SVG / PNG (when previous prediction won!)
   */
  async generateCelebrationTableOverlay(
    games: OverlayGameData[],
    outputPath: string
  ): Promise<string> {
    const tableRows = games
      .slice(0, 6)
      .map((game, i) => {
        const yPos = 520 + i * 150;
        const matchTitle = this.escapeXml(`${game.homeTeam} vs ${game.awayTeam}`);
        const pred = this.escapeXml(game.selections?.[0]?.label || 'Won');

        return `
        <g transform="translate(60, ${yPos})">
          <rect width="960" height="126" rx="20" fill="#064e3b" fill-opacity="0.9" stroke="#10b981" stroke-width="2.5"/>
          <text x="50" y="55" fill="#f0fdf4" font-size="28" font-weight="bold" font-family="Arial, sans-serif">${matchTitle}</text>
          <text x="50" y="95" fill="#a7f3d0" font-size="24" font-weight="600" font-family="Arial, sans-serif">Pick: ${pred}</text>
          
          <!-- Green checkmark circle -->
          <circle cx="890" cy="63" r="32" fill="#10b981"/>
          <path d="M878 63 L886 71 L904 53" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      `;
      })
      .join('\n');

    // Confetti visual particles in SVG
    const confettiColors = ['#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#8b5cf6', '#eab308'];
    const confettiElements: string[] = [];
    for (let c = 0; c < 35; c++) {
      const cx = Math.floor(Math.random() * 1040) + 20;
      const cy = Math.floor(Math.random() * 1800) + 60;
      const color = confettiColors[c % confettiColors.length];
      const r = Math.floor(Math.random() * 12) + 6;
      confettiElements.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="0.85"/>`
      );
    }

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="winGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#047857"/>
          </linearGradient>
        </defs>

        <!-- Confetti background -->
        ${confettiElements.join('\n')}

        <!-- Main Card Container -->
        <g>
          <rect x="30" y="200" width="1020" height="1520" rx="36" fill="#022c22" fill-opacity="0.94" stroke="#10b981" stroke-width="4"/>
          
          <!-- Header Banner -->
          <rect x="60" y="240" width="960" height="230" rx="28" fill="url(#winGrad)"/>
          <text x="540" y="325" fill="#ffffff" font-size="52" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">🎉 100% SUCCESS! 🎉</text>
          <text x="540" y="385" fill="#d1fae5" font-size="34" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">OUR LAST PREDICTIONS HIT BIG!</text>
          <text x="540" y="435" fill="#a7f3d0" font-size="26" font-family="Arial, sans-serif" text-anchor="middle">All recommended selections won</text>
          
          <!-- Rows -->
          ${tableRows}
        </g>
      </svg>
    `;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }

  /**
   * Generate Individual Match Card Overlay (Vertically Centered)
   */
  async generateMatchCardOverlay(
    game: OverlayGameData,
    matchIndex: number,
    totalMatches: number,
    predictionLabel: string,
    outputPath: string
  ): Promise<string> {
    const home = this.escapeXml(game.homeTeam);
    const away = this.escapeXml(game.awayTeam);
    const comp = this.escapeXml(game.competition);
    const pred = this.escapeXml(predictionLabel);
    const time = new Date(game.kickoffTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#020617" stop-opacity="0.98"/>
          </linearGradient>
          <linearGradient id="predGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#ea580c"/>
          </linearGradient>
          <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.7"/>
          </filter>
        </defs>

        <g filter="url(#cardShadow)">
          <!-- Centered Card Container (height 1000, vertically centered at 460) -->
          <rect x="50" y="460" width="980" height="1000" rx="40" fill="url(#cardGrad)" stroke="#38bdf8" stroke-width="3"/>

          <!-- Match Badge Pill -->
          <rect x="360" y="520" width="360" height="64" rx="32" fill="#0369a1"/>
          <text x="540" y="563" fill="#ffffff" font-size="28" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
            MATCH ${matchIndex} OF ${totalMatches}
          </text>

          <!-- Competition & Kickoff Time -->
          <text x="540" y="650" fill="#38bdf8" font-size="34" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
            🏆 ${comp}
          </text>
          <text x="540" y="700" fill="#94a3b8" font-size="26" font-family="Arial, sans-serif" text-anchor="middle">
            ⏰ Kickoff: ${time}
          </text>

          <!-- Divider -->
          <line x1="120" y1="740" x2="960" y2="740" stroke="#334155" stroke-width="2"/>

          <!-- Teams Showcase -->
          <g transform="translate(0, 780)">
            <!-- Home Team Box -->
            <rect x="100" y="0" width="380" height="180" rx="24" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <circle cx="290" cy="55" r="35" fill="#3b82f6" fill-opacity="0.3"/>
            <text x="290" y="65" fill="#60a5fa" font-size="30" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">🏠</text>
            <text x="290" y="130" fill="#f8fafc" font-size="32" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${home}</text>

            <!-- VS Badge -->
            <circle cx="540" cy="90" r="38" fill="#e11d48"/>
            <text x="540" y="99" fill="#ffffff" font-size="26" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">VS</text>

            <!-- Away Team Box -->
            <rect x="600" y="0" width="380" height="180" rx="24" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <circle cx="790" cy="55" r="35" fill="#ef4444" fill-opacity="0.3"/>
            <text x="790" y="65" fill="#f87171" font-size="30" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">✈️</text>
            <text x="790" y="130" fill="#f8fafc" font-size="32" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${away}</text>
          </g>

          <!-- Prediction Showcase Section -->
          <g transform="translate(100, 1070)">
            <rect width="880" height="290" rx="28" fill="url(#predGrad)"/>
            <text x="440" y="70" fill="#ffffff" font-size="28" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="2">
              🔥 PREDICTION SELECTION 🔥
            </text>
            <rect x="50" y="105" width="780" height="135" rx="20" fill="#000000" fill-opacity="0.35"/>
            <text x="440" y="185" fill="#ffffff" font-size="44" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
              ${pred}
            </text>
          </g>
        </g>
      </svg>
    `;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }
}

export const overlayGenerator = new OverlayGenerator();
