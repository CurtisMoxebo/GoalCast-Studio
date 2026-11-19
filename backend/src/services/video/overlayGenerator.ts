import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { teamLogoService } from './teamLogoService';

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
   * Format date display for match card: "Tomorrow" if match is tomorrow, else "DD/MM/YYYY"
   */
  private formatGameDateDisplay(kickoffTime: string): string {
    try {
      const matchDate = new Date(kickoffTime);
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      const isTomorrow =
        matchDate.getFullYear() === tomorrow.getFullYear() &&
        matchDate.getMonth() === tomorrow.getMonth() &&
        matchDate.getDate() === tomorrow.getDate();

      if (isTomorrow) {
        return 'Tomorrow';
      }

      const day = String(matchDate.getDate()).padStart(2, '0');
      const month = String(matchDate.getMonth() + 1).padStart(2, '0');
      const year = matchDate.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return 'Tomorrow';
    }
  }

  /**
   * Format kickoff time to 12-hour AM/PM (e.g. "05:00 PM")
   */
  private formatKickoffTimeAmPm(kickoffTime: string): string {
    try {
      const matchDate = new Date(kickoffTime);
      return matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '05:00 PM';
    }
  }

  /**
   * Generate Introduction Table SVG / PNG (1080x1920 vertical canvas)
   * Requirements:
   * - White background with black text
   * - Real team logos displayed (enlarged & authentic)
   * - Away team is directly UNDER the home team in each game row
   * - No spaces between games; crisp divider lines separate each game
   * - Table height matches content exactly (no extra space at bottom)
   * - Table and title vertically centered on canvas
   * - Home and Away team names have same size, font, and color (extra enlarged for high impact)
   * - Title above table with white highlight and black text: "⚽Best football predictions for {DD/MM/YYYY}⚽" on one line (enlarged)
   */
  async generateTableOverlay(
    games: OverlayGameData[],
    rawDate: string,
    outputPath: string
  ): Promise<string> {
    const slashDate = this.formatSlashDate(rawDate);
    const totalGames = Math.min(games.length, 10);
    const displayGames = games.slice(0, totalGames);

    // Dynamic row heights, logo sizes, and font sizes based on match count (extra enlarged team names & logos)
    let rowHeight = 194;
    let logoSize = 80;
    let nameFontSize = 42;

    if (totalGames >= 9) {
      rowHeight = 128;
      logoSize = 52;
      nameFontSize = 28;
    } else if (totalGames >= 7) {
      rowHeight = 148;
      logoSize = 62;
      nameFontSize = 32;
    } else if (totalGames >= 5) {
      rowHeight = 170;
      logoSize = 72;
      nameFontSize = 37;
    }

    const tableWidth = 1000;
    const tableX = Math.round((1080 - tableWidth) / 2); // 40
    const titleHeight = 88;
    const titleFontSize = 38;
    const gapBetweenTitleAndTable = 24;

    // Fetch real team logos concurrently
    const [homeLogos, awayLogos] = await Promise.all([
      Promise.all(
        displayGames.map((g) => teamLogoService.getLogoDataUri(g.homeTeam, g.homeTeamLogo, logoSize))
      ),
      Promise.all(
        displayGames.map((g) => teamLogoService.getLogoDataUri(g.awayTeam, g.awayTeamLogo, logoSize))
      )
    ]);

    // Total table height matches content exactly (no space between games)
    const totalTableHeight = displayGames.length * rowHeight;
    const combinedHeight = titleHeight + gapBetweenTitleAndTable + totalTableHeight;
    const startY = Math.round((1920 - combinedHeight) / 2);

    const titleY = startY;
    const tableStartY = titleY + titleHeight + gapBetweenTitleAndTable;

    // Render game rows inside unified white table with dividers
    const rowsSvg = displayGames
      .map((game, i) => {
        const rowY = i * rowHeight;
        const home = this.escapeXml(game.homeTeam);
        const away = this.escapeXml(game.awayTeam);
        const comp = this.escapeXml(game.competition);
        const time = new Date(game.kickoffTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        // Team line offsets (home on top half, away on bottom half)
        const rowHalf = rowHeight / 2;
        const homeLogoY = rowY + Math.round((rowHalf - logoSize) / 2);
        const awayLogoY = rowY + Math.round(rowHalf + (rowHalf - logoSize) / 2);

        const homeTextBaselineY = Math.round(homeLogoY + logoSize / 2 + nameFontSize * 0.35);
        const awayTextBaselineY = Math.round(awayLogoY + logoSize / 2 + nameFontSize * 0.35);

        const logoX = 94;
        const nameX = logoX + logoSize + 18;
        const badgeHeight = rowHeight - 24;

        // Is this the last game row? If not, render a clear divider between games
        const isLastRow = i === displayGames.length - 1;
        const dividerSvg = !isLastRow
          ? `<line x1="20" y1="${rowY + rowHeight}" x2="${tableWidth - 20}" y2="${rowY + rowHeight}" stroke="#cbd5e1" stroke-width="2"/>`
          : '';

        return `
        <!-- Game Row ${i + 1} (No outer gap, separated by divider) -->
        <g>
          <!-- Match Index Circle on Left -->
          <circle cx="48" cy="${rowY + Math.round(rowHeight / 2)}" r="24" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="48" y="${rowY + Math.round(rowHeight / 2 + 7)}" fill="#0f172a" font-size="21" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">${i + 1}</text>

          <!-- Vertical Divider between index badge and teams -->
          <line x1="80" y1="${rowY + 12}" x2="80" y2="${rowY + rowHeight - 12}" stroke="#f1f5f9" stroke-width="2"/>

          <!-- HOME TEAM (Top Row - Real Logo & Enlarged Name) -->
          <image href="${homeLogos[i]}" x="${logoX}" y="${homeLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="${nameX}" y="${homeTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${home}
          </text>

          <!-- Subtle Divider between Home & Away inside the row -->
          <line x1="${logoX}" y1="${rowY + Math.round(rowHalf)}" x2="${tableWidth - 190}" y2="${rowY + Math.round(rowHalf)}" stroke="#f8fafc" stroke-width="1"/>

          <!-- AWAY TEAM (Bottom Row - DIRECTLY UNDER HOME TEAM) -->
          <image href="${awayLogos[i]}" x="${logoX}" y="${awayLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <!-- Same size, font and color as home team -->
          <text x="${nameX}" y="${awayTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${away}
          </text>

          <!-- Competition & Kickoff Time Badge on Right -->
          <g transform="translate(${tableWidth - 176}, ${rowY + Math.round((rowHeight - badgeHeight) / 2)})">
            <rect width="156" height="${badgeHeight}" rx="14" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="78" y="${Math.round(badgeHeight * 0.44)}" fill="#64748b" font-size="${Math.max(13, nameFontSize - 10)}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
              ${comp}
            </text>
            <text x="78" y="${Math.round(badgeHeight * 0.82)}" fill="#0f172a" font-size="${Math.max(17, nameFontSize - 6)}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
              ⏰ ${time}
            </text>
          </g>

          <!-- Clear divider between games -->
          ${dividerSvg}
        </g>
      `;
      })
      .join('\n');

    const titleText = `⚽Best football predictions for ${slashDate}⚽`;

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="cardShadow" x="-5%" y="-10%" width="110%" height="130%">
            <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.55"/>
          </filter>
        </defs>

        <!-- 1. TITLE ABOVE THE GAME GROUP: White highlight background + Black text on one line (Enlarged) -->
        <g filter="url(#cardShadow)" transform="translate(${tableX}, ${titleY})">
          <!-- White Highlight Box -->
          <rect width="${tableWidth}" height="${titleHeight}" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
          <!-- Black Title Text -->
          <text x="${tableWidth / 2}" y="${Math.round(titleHeight / 2 + titleFontSize * 0.35)}" fill="#000000" font-size="${titleFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">
            ${this.escapeXml(titleText)}
          </text>
        </g>

        <!-- 2. GAME GROUP TABLE: Single continuous white container, NO spaces between games, crisp divider lines -->
        <g filter="url(#cardShadow)" transform="translate(${tableX}, ${tableStartY})">
          <!-- Unified White Table Background matching exact content height -->
          <rect width="${tableWidth}" height="${totalTableHeight}" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>

          <!-- Match Rows & Dividers -->
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
   * Generate Prediction Overlay (revealed under the game section box)
   */
  async generatePredictionOverlay(
    predictionLabel: string,
    outputPath: string
  ): Promise<string> {
    const pred = this.escapeXml(predictionLabel);
    let predFontSize = 46;
    if (pred.length > 25) {
      predFontSize = 36;
    } else if (pred.length > 18) {
      predFontSize = 40;
    }

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="predGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#ea580c"/>
          </linearGradient>
          <filter id="predShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.65"/>
          </filter>
        </defs>

        <!-- Prediction Banner (Under the game section box, centered at y=980) -->
        <g filter="url(#predShadow)">
          <rect x="50" y="980" width="980" height="210" rx="32" fill="url(#predGrad)" stroke="#fbbf24" stroke-width="3"/>
          <text x="540" y="1035" fill="#ffffff" font-size="26" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="2">
            🔥 PREDICTION SELECTION 🔥
          </text>
          <rect x="85" y="1055" width="910" height="110" rx="20" fill="#000000" fill-opacity="0.38"/>
          <text x="540" y="1126" fill="#ffffff" font-size="${predFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
            ${pred}
          </text>
        </g>
      </svg>
    `;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }

  /**
   * Generate Single Game Section Box Overlay
   * Requirements:
   * - No competition name or kickoff time in the section above
   * - No box around the team names and logo
   * - Replace VS section between teams with:
   *   - Above time: competition name
   *   - Middle: kickoff time (e.g. 05:00 PM)
   *   - Under time: date in smaller text ("Tomorrow" if tomorrow, else "DD/MM/YYYY")
   * - No prediction inside this box (revealed separately under this box)
   */
  async generateMatchCardOverlay(
    game: OverlayGameData,
    matchIndex: number,
    totalMatches: number,
    param4: string,
    param5?: string
  ): Promise<string> {
    const outputPath = param5 || param4;
    const home = this.escapeXml(game.homeTeam);
    const away = this.escapeXml(game.awayTeam);
    const comp = this.escapeXml(game.competition);
    const timeAmPm = this.formatKickoffTimeAmPm(game.kickoffTime);
    const dateText = this.formatGameDateDisplay(game.kickoffTime);

    // Fetch real team logos for single match showcase (size 114)
    const logoSize = 114;
    const [homeLogoUri, awayLogoUri] = await Promise.all([
      teamLogoService.getLogoDataUri(game.homeTeam, game.homeTeamLogo, logoSize),
      teamLogoService.getLogoDataUri(game.awayTeam, game.awayTeamLogo, logoSize)
    ]);

    // Adaptive font sizes for team names in the single game section
    const homeFontSize = home.length > 14 ? 28 : 34;
    const awayFontSize = away.length > 14 ? 28 : 34;

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" stop-opacity="0.96"/>
            <stop offset="100%" stop-color="#020617" stop-opacity="0.98"/>
          </linearGradient>
          <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.7"/>
          </filter>
        </defs>

        <g filter="url(#cardShadow)">
          <!-- Centered Game Section Box (height 430, y=520 to 950) -->
          <rect x="50" y="520" width="980" height="430" rx="36" fill="url(#cardGrad)" stroke="#38bdf8" stroke-width="3"/>

          <!-- Match Badge Pill at Top (Clean, without competition or kickoff above) -->
          <rect x="360" y="555" width="360" height="56" rx="28" fill="#0369a1"/>
          <text x="540" y="593" fill="#ffffff" font-size="26" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
            MATCH ${matchIndex} OF ${totalMatches}
          </text>

          <!-- TEAMS & CENTER MATCH INFO SECTION (No enclosing boxes around teams) -->
          <!-- HOME TEAM (Left, centered at x=220) -->
          <image href="${homeLogoUri}" x="163" y="640" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="220" y="795" fill="#ffffff" font-size="${homeFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
            ${home}
          </text>

          <!-- CENTER SECTION (Competition above, Time in middle, Date under) -->
          <!-- Above Time: Competition Name -->
          <text x="540" y="682" fill="#38bdf8" font-size="25" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
            🏆 ${comp}
          </text>
          <!-- Middle: Kickoff Time (e.g. 05:00 PM) -->
          <text x="540" y="736" fill="#ffffff" font-size="40" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
            ${timeAmPm}
          </text>
          <!-- Under Time: Date (Tomorrow / dd/mm/yyyy) -->
          <text x="540" y="776" fill="#94a3b8" font-size="23" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
            ${dateText}
          </text>

          <!-- AWAY TEAM (Right, centered at x=860) -->
          <image href="${awayLogoUri}" x="803" y="640" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="860" y="795" fill="#ffffff" font-size="${awayFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
            ${away}
          </text>
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
