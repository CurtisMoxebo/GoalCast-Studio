import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export interface OverlayGameData {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffTime: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  competitionLogo?: string;
  selections?: { code: string; label: string; spokenText: string }[];
}

// Pre-defined color palettes for popular clubs to render crisp vector crests
const TEAM_CREST_THEMES: Record<string, { bg: string; fg: string; accent: string; icon?: string }> = {
  arsenal: { bg: '#DB0007', fg: '#FFFFFF', accent: '#9C824A', icon: '⚽' },
  chelsea: { bg: '#034694', fg: '#FFFFFF', accent: '#DBA111', icon: '🦁' },
  'real madrid': { bg: '#FFFFFF', fg: '#1F2937', accent: '#EE8707', icon: '👑' },
  barcelona: { bg: '#A50044', fg: '#FFFFFF', accent: '#004D98', icon: '🛡️' },
  'manchester city': { bg: '#6CABDD', fg: '#1C2C5B', accent: '#FFFFFF', icon: '⛵' },
  'man city': { bg: '#6CABDD', fg: '#1C2C5B', accent: '#FFFFFF', icon: '⛵' },
  liverpool: { bg: '#C8102E', fg: '#FFFFFF', accent: '#00B2A9', icon: '🦅' },
  'bayern munich': { bg: '#DC052D', fg: '#FFFFFF', accent: '#0066B2', icon: '⭐' },
  'bayern': { bg: '#DC052D', fg: '#FFFFFF', accent: '#0066B2', icon: '⭐' },
  'borussia dortmund': { bg: '#FDE100', fg: '#000000', accent: '#000000', icon: '⚡' },
  dortmund: { bg: '#FDE100', fg: '#000000', accent: '#000000', icon: '⚡' },
  'paris saint-germain': { bg: '#004170', fg: '#FFFFFF', accent: '#DA291C', icon: '🗼' },
  psg: { bg: '#004170', fg: '#FFFFFF', accent: '#DA291C', icon: '🗼' },
  'inter milan': { bg: '#0068A8', fg: '#FFFFFF', accent: '#000000', icon: '⭐' },
  'ac milan': { bg: '#FB090B', fg: '#FFFFFF', accent: '#000000', icon: '🔴' },
  'al-hilal': { bg: '#004BA0', fg: '#FFFFFF', accent: '#FFFFFF', icon: '🌙' },
  'al-nassr': { bg: '#FBE106', fg: '#00407B', accent: '#00407B', icon: '👑' },
  'inter miami': { bg: '#F7B5CD', fg: '#231F20', accent: '#231F20', icon: '🦩' },
  'inter miami cf': { bg: '#F7B5CD', fg: '#231F20', accent: '#231F20', icon: '🦩' },
  'la galaxy': { bg: '#00245D', fg: '#FFFFFF', accent: '#EEB111', icon: '✨' },
  'sporting cp': { bg: '#008057', fg: '#FFFFFF', accent: '#FFD700', icon: '🦁' },
  benfica: { bg: '#E41C23', fg: '#FFFFFF', accent: '#FFD700', icon: '🦅' },
  ajax: { bg: '#D2122E', fg: '#FFFFFF', accent: '#FFFFFF', icon: '🛡️' },
  feyenoord: { bg: '#DF0024', fg: '#FFFFFF', accent: '#000000', icon: '⚪' }
};

export class OverlayGenerator {
  /**
   * Escape XML/SVG special characters
   */
  private escapeXml(unsafe: string): string {
    return (unsafe || '').replace(/[<>&'"]/g, (c) => {
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
   * Format date string to DD/MM/YYYY (e.g. 19/11/2026)
   */
  private formatSlashDate(dateStr: string): string {
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }

  /**
   * Generate vector shield/crest SVG snippet for a team
   */
  private renderTeamCrestSvg(teamName: string, size: number): string {
    const key = (teamName || '').toLowerCase().trim();
    const theme = TEAM_CREST_THEMES[key] || {
      bg: '#1e293b',
      fg: '#ffffff',
      accent: '#38bdf8',
      icon: '⚽'
    };

    const initials = this.escapeXml(
      teamName
        .split(' ')
        .filter((w) => w.length > 0)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('')
    );

    const half = size / 2;
    const radius = Math.round(size * 0.22);
    const fontSize = Math.round(size * 0.36);

    return `
      <g>
        <!-- Shield Base -->
        <rect width="${size}" height="${size}" rx="${radius}" fill="${theme.bg}" stroke="${theme.accent}" stroke-width="2"/>
        <!-- Inner Accent Circle -->
        <circle cx="${half}" cy="${half}" r="${Math.round(size * 0.36)}" fill="${theme.accent}" fill-opacity="0.18"/>
        <!-- Initials Text -->
        <text x="${half}" y="${Math.round(half + fontSize * 0.36)}" fill="${theme.fg}" font-size="${fontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">${initials}</text>
      </g>
    `;
  }

  /**
   * Generate Introduction Table SVG / PNG (1080x1920 vertical canvas)
   * Requirements:
   * - White background with black text
   * - Team logos displayed
   * - Table height matches content exactly (no extra space at bottom)
   * - Vertically centered on canvas
   * - Home and Away team names have same size, font, and color
   * - Title above table with white highlight and black text: "⚽Best football predictions for {DD/MM/YYYY}⚽" on one line
   */
  async generateTableOverlay(
    games: OverlayGameData[],
    rawDate: string,
    outputPath: string
  ): Promise<string> {
    const slashDate = this.formatSlashDate(rawDate);
    const totalGames = Math.min(games.length, 10);
    const displayGames = games.slice(0, totalGames);

    // Dynamic row height based on count
    let rowHeight = 125;
    let nameFontSize = 26;
    let logoSize = 48;

    if (totalGames >= 8) {
      rowHeight = 96;
      nameFontSize = 21;
      logoSize = 40;
    } else if (totalGames >= 6) {
      rowHeight = 110;
      nameFontSize = 23;
      logoSize = 44;
    }

    const paddingY = 16;
    const tableWidth = 1000;
    const tableHeight = displayGames.length * rowHeight + paddingY * 2;
    const titleHeight = 78;
    const gapBetweenTitleAndTable = 24;

    const combinedHeight = titleHeight + gapBetweenTitleAndTable + tableHeight;
    const startY = Math.round((1920 - combinedHeight) / 2);

    const titleY = startY;
    const tableY = titleY + titleHeight + gapBetweenTitleAndTable;
    const tableX = Math.round((1080 - tableWidth) / 2); // 40

    // Render table rows
    const rowsSvg = displayGames
      .map((game, i) => {
        const yOffset = paddingY + i * rowHeight;
        const home = this.escapeXml(game.homeTeam);
        const away = this.escapeXml(game.awayTeam);
        const comp = this.escapeXml(game.competition);
        const time = new Date(game.kickoffTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const isLastRow = i === displayGames.length - 1;
        const crestOffsetY = Math.round((rowHeight - logoSize) / 2);
        const textBaselineY = Math.round(rowHeight / 2 + nameFontSize * 0.35);

        return `
        <g transform="translate(0, ${yOffset})">
          <!-- Optional zebra tint on even rows for clean readability -->
          ${i % 2 === 1 ? `<rect x="0" y="0" width="${tableWidth}" height="${rowHeight}" fill="#f8fafc"/>` : ''}

          <!-- Match Index Circle -->
          <circle cx="36" cy="${Math.round(rowHeight / 2)}" r="18" fill="#e2e8f0"/>
          <text x="36" y="${Math.round(rowHeight / 2 + 6)}" fill="#0f172a" font-size="16" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">${i + 1}</text>

          <!-- Home Team Logo -->
          <g transform="translate(68, ${crestOffsetY})">
            ${this.renderTeamCrestSvg(game.homeTeam, logoSize)}
          </g>

          <!-- Home Team Name (Black text) -->
          <text x="${68 + logoSize + 12}" y="${textBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="start">
            ${home}
          </text>

          <!-- VS Divider Badge -->
          <g transform="translate(480, ${Math.round(rowHeight / 2 - 16)})">
            <rect width="40" height="32" rx="8" fill="#fee2e2"/>
            <text x="20" y="21" fill="#dc2626" font-size="13" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">VS</text>
          </g>

          <!-- Away Team Logo -->
          <g transform="translate(535, ${crestOffsetY})">
            ${this.renderTeamCrestSvg(game.awayTeam, logoSize)}
          </g>

          <!-- Away Team Name (Black text - EXACT SAME SIZE, FONT & COLOR AS HOME) -->
          <text x="${535 + logoSize + 12}" y="${textBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="start">
            ${away}
          </text>

          <!-- Kickoff Time / Comp Pill on Right -->
          <g transform="translate(${tableWidth - 110}, ${Math.round(rowHeight / 2 - 20)})">
            <rect width="94" height="40" rx="10" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
            <text x="47" y="25" fill="#0f172a" font-size="16" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
              ${time}
            </text>
          </g>

          <!-- Row Bottom Divider (except last row) -->
          ${!isLastRow ? `<line x1="20" y1="${rowHeight}" x2="${tableWidth - 20}" y2="${rowHeight}" stroke="#e2e8f0" stroke-width="1.5"/>` : ''}
        </g>
      `;
      })
      .join('\n');

    const titleText = `⚽Best football predictions for ${slashDate}⚽`;

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="tableShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.6"/>
          </filter>
        </defs>

        <!-- 1. TITLE ABOVE THE GAME GROUP: White highlight background + Black text on one line -->
        <g filter="url(#tableShadow)" transform="translate(${tableX}, ${titleY})">
          <!-- White Highlight Box -->
          <rect width="${tableWidth}" height="${titleHeight}" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
          <!-- Black Title Text -->
          <text x="${tableWidth / 2}" y="52" fill="#000000" font-size="34" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">
            ${this.escapeXml(titleText)}
          </text>
        </g>

        <!-- 2. GAME GROUP TABLE: White background + Black text + Content-matched height + Vertically centered -->
        <g filter="url(#tableShadow)" transform="translate(${tableX}, ${tableY})">
          <!-- Table Container (White background, height exactly matching content) -->
          <rect width="${tableWidth}" height="${tableHeight}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2.5"/>

          <!-- Rendered Rows -->
          ${rowsSvg}
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

          <!-- Teams Showcase with Crests -->
          <g transform="translate(0, 780)">
            <!-- Home Team Box -->
            <rect x="100" y="0" width="380" height="180" rx="24" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <g transform="translate(250, 20)">
              ${this.renderTeamCrestSvg(game.homeTeam, 80)}
            </g>
            <text x="290" y="145" fill="#f8fafc" font-size="30" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${home}</text>

            <!-- VS Badge -->
            <circle cx="540" cy="90" r="38" fill="#e11d48"/>
            <text x="540" y="99" fill="#ffffff" font-size="26" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">VS</text>

            <!-- Away Team Box -->
            <rect x="600" y="0" width="380" height="180" rx="24" fill="#1e293b" stroke="#475569" stroke-width="2"/>
            <g transform="translate(750, 20)">
              ${this.renderTeamCrestSvg(game.awayTeam, 80)}
            </g>
            <text x="790" y="145" fill="#f8fafc" font-size="30" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">${away}</text>
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
