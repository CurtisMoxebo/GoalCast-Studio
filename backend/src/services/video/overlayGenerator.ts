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

export class OverlayGenerator {
  /**
   * Escape XML/SVG special characters safely converting any input to string
   */
  private escapeXml(unsafe: any): string {
    const str = unsafe instanceof Date ? unsafe.toISOString() : String(unsafe ?? '');
    return str.replace(/[<>&'"]/g, (c) => {
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
   * Format date string or Date object to DD/MM/YYYY (e.g. 19/11/2026)
   */
  private formatSlashDate(dateInput: any): string {
    try {
      if (!dateInput) return 'Matchday';
      const d = dateInput instanceof Date
        ? dateInput
        : new Date(String(dateInput).includes('T') ? String(dateInput) : `${dateInput}T00:00:00`);
      if (isNaN(d.getTime())) return String(dateInput);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return String(dateInput ?? 'Matchday');
    }
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
   * Format a betting prediction into its short version (e.g. BTTS, 1X, Over 2.5, 1)
   */
  public formatShortPrediction(code?: string, label?: string): string {
    const rawCode = (code || '').toUpperCase().trim();
    const rawLabel = (label || '').trim();

    // 1. Direct short codes
    if (rawCode === 'BTTS_YES') return 'BTTS';
    if (rawCode === 'BTTS_NO') return 'BTTS NO';
    if (['1', '2', 'X', '1X', 'X2', '12'].includes(rawCode)) return rawCode;
    if (rawCode === '1_DNB' || rawCode === '1 DNB') return '1 DNB';
    if (rawCode === '2_DNB' || rawCode === '2 DNB') return '2 DNB';

    // 2. Over / Under goal patterns (e.g. OVER_2_5_GOALS -> Over 2.5)
    const overMatch = rawCode.match(/^OVER_([0-9]+)_([0-9]+)_GOALS$/);
    if (overMatch) return `Over ${overMatch[1]}.${overMatch[2]}`;
    const underMatch = rawCode.match(/^UNDER_([0-9]+)_([0-9]+)_GOALS$/);
    if (underMatch) return `Under ${underMatch[1]}.${underMatch[2]}`;

    // Team Over/Under
    const homeOver = rawCode.match(/^HOME_OVER_([0-9]+)_([0-9]+)_GOALS$/);
    if (homeOver) return `Home O ${homeOver[1]}.${homeOver[2]}`;
    const awayOver = rawCode.match(/^AWAY_OVER_([0-9]+)_([0-9]+)_GOALS$/);
    if (awayOver) return `Away O ${awayOver[1]}.${awayOver[2]}`;

    // Corners
    const cornerOver = rawCode.match(/^CORNERS_OVER_([0-9]+)_([0-9]+)$/);
    if (cornerOver) return `Corners > ${cornerOver[1]}.${cornerOver[2]}`;

    // 3. Fallback from label
    if (/both teams to score/i.test(rawLabel)) {
      return /no/i.test(rawLabel) ? 'BTTS NO' : 'BTTS';
    }
    const labelCodeMatch = rawLabel.match(/\((1X|X2|12|1 DNB|2 DNB|1|2|X)\)/i);
    if (labelCodeMatch) return labelCodeMatch[1].toUpperCase();

    const labelOverMatch = rawLabel.match(/Over\s+([0-9]+\.?[0-9]*)/i);
    if (labelOverMatch) return `Over ${labelOverMatch[1]}`;
    const labelUnderMatch = rawLabel.match(/Under\s+([0-9]+\.?[0-9]*)/i);
    if (labelUnderMatch) return `Under ${labelUnderMatch[1]}`;

    if (/to win/i.test(rawLabel)) {
      if (/home|1\b/i.test(rawLabel)) return '1';
      if (/away|2\b/i.test(rawLabel)) return '2';
    }

    return rawCode || rawLabel || 'WON';
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
   * - Home and Away team names have same size, font, and color (extra enlarged for maximum readability)
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
    let rowHeight = 250;
    let logoSize = 108;
    let nameFontSize = 56;

    if (totalGames >= 9) {
      rowHeight = 142;
      logoSize = 64;
      nameFontSize = 32;
    } else if (totalGames >= 7) {
      rowHeight = 168;
      logoSize = 76;
      nameFontSize = 38;
    } else if (totalGames >= 5) {
      rowHeight = 200;
      logoSize = 90;
      nameFontSize = 46;
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

        const logoX = 92;
        const nameX = logoX + logoSize + 22;
        const badgeHeight = rowHeight - 28;

        // Is this the last game row? If not, render a clear divider between games
        const isLastRow = i === displayGames.length - 1;
        const dividerSvg = !isLastRow
          ? `<line x1="20" y1="${rowY + rowHeight}" x2="${tableWidth - 20}" y2="${rowY + rowHeight}" stroke="#cbd5e1" stroke-width="2"/>`
          : '';

        return `
        <!-- Game Row ${i + 1} (No outer gap, separated by divider) -->
        <g>
          <!-- Match Index Circle on Left -->
          <circle cx="48" cy="${rowY + Math.round(rowHeight / 2)}" r="28" fill="#f1f5f9" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="48" y="${rowY + Math.round(rowHeight / 2 + 8)}" fill="#0f172a" font-size="24" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">${i + 1}</text>

          <!-- Vertical Divider between index badge and teams -->
          <line x1="80" y1="${rowY + 12}" x2="80" y2="${rowY + rowHeight - 12}" stroke="#f1f5f9" stroke-width="2"/>

          <!-- HOME TEAM (Top Row - Real Logo & Extra Enlarged Name) -->
          <image href="${homeLogos[i]}" x="${logoX}" y="${homeLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="${nameX}" y="${homeTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${home}
          </text>

          <!-- Subtle Divider between Home & Away inside the row -->
          <line x1="${logoX}" y1="${rowY + Math.round(rowHalf)}" x2="${tableWidth - 205}" y2="${rowY + Math.round(rowHalf)}" stroke="#f1f5f9" stroke-width="1.5"/>

          <!-- AWAY TEAM (Bottom Row - DIRECTLY UNDER HOME TEAM) -->
          <image href="${awayLogos[i]}" x="${logoX}" y="${awayLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <!-- Same size, font and color as home team -->
          <text x="${nameX}" y="${awayTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${away}
          </text>

          <!-- Competition & Kickoff Time Badge on Right -->
          <g transform="translate(${tableWidth - 192}, ${rowY + Math.round((rowHeight - badgeHeight) / 2)})">
            <rect width="176" height="${badgeHeight}" rx="14" fill="#f8fafc" fill-opacity="0.80" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="88" y="${Math.round(badgeHeight * 0.44)}" fill="#64748b" font-size="${comp.length > 12 ? 20 : (comp.length > 8 ? 23 : 26)}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
              ${comp}
            </text>
            <text x="88" y="${Math.round(badgeHeight * 0.82)}" fill="#0f172a" font-size="30" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
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
          <rect width="${tableWidth}" height="${titleHeight}" rx="24" fill="#ffffff" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="2.5"/>
          <!-- Black Title Text -->
          <text x="${tableWidth / 2}" y="${Math.round(titleHeight / 2 + titleFontSize * 0.35)}" fill="#000000" font-size="${titleFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">
            ${this.escapeXml(titleText)}
          </text>
        </g>

        <!-- 2. GAME GROUP TABLE: Single continuous white container, NO spaces between games, crisp divider lines -->
        <g filter="url(#cardShadow)" transform="translate(${tableX}, ${tableStartY})">
          <!-- Unified White Table Background matching exact content height -->
          <rect width="${tableWidth}" height="${totalTableHeight}" rx="24" fill="#ffffff" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="2.5"/>

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
   * Matches the regular table structure (white background, real team logos, away team under home team,
   * snug content height vertically centered, title with white highlight and black text),
   * but displays the winning prediction in green with a green check mark instead of competition/time.
   */
  async generateCelebrationTableOverlay(
    games: OverlayGameData[],
    outputPath: string
  ): Promise<string> {
    const totalGames = Math.min(games.length, 10);
    const displayGames = games.slice(0, totalGames);

    // Dynamic row heights, logo sizes, and font sizes matching regular table
    let rowHeight = 250;
    let logoSize = 108;
    let nameFontSize = 56;

    if (totalGames >= 9) {
      rowHeight = 142;
      logoSize = 64;
      nameFontSize = 32;
    } else if (totalGames >= 7) {
      rowHeight = 168;
      logoSize = 76;
      nameFontSize = 38;
    } else if (totalGames >= 5) {
      rowHeight = 200;
      logoSize = 90;
      nameFontSize = 46;
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

    // Confetti visual splash particles in SVG
    const confettiColors = [
      '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#8b5cf6', 
      '#eab308', '#ef4444', '#06b6d4', '#22c55e', '#ffd700'
    ];
    const confettiElements: string[] = [];
    for (let c = 0; c < 90; c++) {
      const cx = Math.floor(Math.random() * 1040) + 20;
      const cy = Math.floor(Math.random() * 1800) + 60;
      const color = confettiColors[c % confettiColors.length];
      const shapeType = c % 4;
      const rot = Math.floor(Math.random() * 360);
      const size = Math.floor(Math.random() * 14) + 8;

      if (shapeType === 0) {
        // Streamer ribbon
        confettiElements.push(
          `<rect x="${cx - size}" y="${cy - Math.round(size / 4)}" width="${size * 2}" height="${Math.round(size * 0.6)}" rx="3" fill="${color}" transform="rotate(${rot} ${cx} ${cy})"/>`
        );
      } else if (shapeType === 1) {
        // Disc / circle
        confettiElements.push(
          `<circle cx="${cx}" cy="${cy}" r="${Math.round(size * 0.6)}" fill="${color}"/>`
        );
      } else if (shapeType === 2) {
        // Diamond / square
        confettiElements.push(
          `<rect x="${cx - Math.round(size / 2)}" y="${cy - Math.round(size / 2)}" width="${size}" height="${size}" rx="2" fill="${color}" transform="rotate(${rot} ${cx} ${cy})"/>`
        );
      } else {
        // Star sparkle
        confettiElements.push(
          `<polygon points="${cx},${cy-size} ${cx+Math.round(size*0.25)},${cy-Math.round(size*0.25)} ${cx+size},${cy} ${cx+Math.round(size*0.25)},${cy+Math.round(size*0.25)} ${cx},${cy+size} ${cx-Math.round(size*0.25)},${cy+Math.round(size*0.25)} ${cx-size},${cy} ${cx-Math.round(size*0.25)},${cy-Math.round(size*0.25)}" fill="${color}"/>`
        );
      }
    }

    // Render game rows inside unified white table with dividers
    const rowsSvg = displayGames
      .map((game, i) => {
        const rowY = i * rowHeight;
        const home = this.escapeXml(game.homeTeam);
        const away = this.escapeXml(game.awayTeam);
        const shortPred =
          game.selections && game.selections.length > 1
            ? `${this.formatShortPrediction(game.selections[0].code, game.selections[0].label)} & ${this.formatShortPrediction(game.selections[1].code, game.selections[1].label)}`
            : this.formatShortPrediction(game.selections?.[0]?.code, game.selections?.[0]?.label);

        // Team line offsets (home on top half, away on bottom half)
        const rowHalf = rowHeight / 2;
        const homeLogoY = rowY + Math.round((rowHalf - logoSize) / 2);
        const awayLogoY = rowY + Math.round(rowHalf + (rowHalf - logoSize) / 2);

        const homeTextBaselineY = Math.round(homeLogoY + logoSize / 2 + nameFontSize * 0.35);
        const awayTextBaselineY = Math.round(awayLogoY + logoSize / 2 + nameFontSize * 0.35);

        const logoX = 92;
        const nameX = logoX + logoSize + 22;
        const badgeHeight = rowHeight - 28;
        const badgeWidth = 268;

        // Check mark icon on the RIGHT of this section (enlarged)
        const checkRadius = Math.min(30, Math.round(badgeHeight * 0.22));
        const checkCx = badgeWidth - checkRadius - 16;
        const checkCy = Math.round(badgeHeight / 2);

        // Winning prediction text: black text with green highlight (slightly smaller for sleek fit)
        const highlightWidth = checkCx - checkRadius - 20;
        const highlightHeight = Math.min(74, Math.round(badgeHeight * 0.44));
        const highlightY = Math.round((badgeHeight - highlightHeight) / 2);

        let predFontSize = Math.min(34, Math.round(highlightHeight * 0.52));
        if (shortPred.length > 14) {
          predFontSize = Math.min(18, Math.round(highlightHeight * 0.30));
        } else if (shortPred.length > 7) {
          predFontSize = Math.min(22, Math.round(highlightHeight * 0.38));
        }
        else if (shortPred.length > 5) predFontSize = Math.min(26, Math.round(highlightHeight * 0.44));

        const badgeContent = `
          <!-- Section Container on Right -->
          <rect width="${badgeWidth}" height="${badgeHeight}" rx="18" fill="#f8fafc" fill-opacity="0.80" stroke="#e2e8f0" stroke-width="1.5"/>

          <!-- Green Highlight with Bold Black Text (Short Version) -->
          <rect x="14" y="${highlightY}" width="${highlightWidth}" height="${highlightHeight}" rx="12" fill="#22c55e"/>
          <text x="${14 + highlightWidth / 2}" y="${Math.round(highlightY + highlightHeight / 2 + predFontSize * 0.35)}" fill="#000000" font-size="${predFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">
            ${this.escapeXml(shortPred)}
          </text>

          <!-- Green Check Mark Icon on the RIGHT of this section (Enlarged) -->
          <circle cx="${checkCx}" cy="${checkCy}" r="${checkRadius}" fill="#16a34a"/>
          <path d="M${checkCx - Math.round(checkRadius * 0.38)} ${checkCy} L${checkCx - Math.round(checkRadius * 0.10)} ${checkCy + Math.round(checkRadius * 0.30)} L${checkCx + Math.round(checkRadius * 0.38)} ${checkCy - Math.round(checkRadius * 0.30)}" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        `;

        // Is this the last game row? If not, render a clear divider between games
        const isLastRow = i === displayGames.length - 1;
        const dividerSvg = !isLastRow
          ? `<line x1="20" y1="${rowY + rowHeight}" x2="${tableWidth - 20}" y2="${rowY + rowHeight}" stroke="#cbd5e1" stroke-width="2"/>`
          : '';

        return `
        <!-- Game Row ${i + 1} (No outer gap, separated by divider) -->
        <g>
          <!-- Match Index Circle on Left -->
          <circle cx="48" cy="${rowY + Math.round(rowHeight / 2)}" r="28" fill="#f1f5f9" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="48" y="${rowY + Math.round(rowHeight / 2 + 8)}" fill="#0f172a" font-size="24" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">${i + 1}</text>

          <!-- Vertical Divider between index badge and teams -->
          <line x1="80" y1="${rowY + 12}" x2="80" y2="${rowY + rowHeight - 12}" stroke="#f1f5f9" stroke-width="2"/>

          <!-- HOME TEAM (Top Row - Real Logo & Extra Enlarged Name) -->
          <image href="${homeLogos[i]}" x="${logoX}" y="${homeLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="${nameX}" y="${homeTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${home}
          </text>

          <!-- Subtle Divider between Home & Away inside the row -->
          <line x1="${logoX}" y1="${rowY + Math.round(rowHalf)}" x2="${tableWidth - (badgeWidth + 28)}" y2="${rowY + Math.round(rowHalf)}" stroke="#f1f5f9" stroke-width="1.5"/>

          <!-- AWAY TEAM (Bottom Row - DIRECTLY UNDER HOME TEAM) -->
          <image href="${awayLogos[i]}" x="${logoX}" y="${awayLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <!-- Same size, font and color as home team -->
          <text x="${nameX}" y="${awayTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${away}
          </text>

          <!-- Winning Prediction Section on Right (Black text with green highlight + check mark on right) -->
          <g transform="translate(${tableWidth - (badgeWidth + 18)}, ${rowY + Math.round((rowHeight - badgeHeight) / 2)})">
            ${badgeContent}
          </g>

          <!-- Clear divider between games -->
          ${dividerSvg}
        </g>
      `;
      })
      .join('\n');

    const titleText = '🎉Congratulations on the previous win🎉';

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="celebCardShadow" x="-5%" y="-10%" width="110%" height="130%">
            <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.55"/>
          </filter>
        </defs>

        <!-- 1. TITLE ABOVE THE WINNING GROUP: White highlight background + Black text on one line -->
        <g filter="url(#celebCardShadow)" transform="translate(${tableX}, ${titleY})">
          <!-- White Highlight Box -->
          <rect width="${tableWidth}" height="${titleHeight}" rx="24" fill="#ffffff" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="2.5"/>
          <!-- Black Title Text -->
          <text x="${tableWidth / 2}" y="${Math.round(titleHeight / 2 + titleFontSize * 0.35)}" fill="#000000" font-size="${titleFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">
            ${titleText}
          </text>
        </g>

        <!-- 2. GAME WINNING TABLE: Same white container as regular table, NO spaces between games, crisp divider lines -->
        <g filter="url(#celebCardShadow)" transform="translate(${tableX}, ${tableStartY})">
          <!-- Unified White Table Background matching exact content height -->
          <rect width="${tableWidth}" height="${totalTableHeight}" rx="24" fill="#ffffff" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="2.5"/>

          <!-- Match Rows & Dividers -->
          ${rowsSvg}
        </g>

        <!-- Confetti festive splash particles in foreground -->
        ${confettiElements.join('\n')}
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
    if (pred.length > 40) {
      predFontSize = 28;
    } else if (pred.length > 30) {
      predFontSize = 32;
    } else if (pred.length > 22) {
      predFontSize = 38;
    } else if (pred.length > 16) {
      predFontSize = 42;
    }

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="predShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.65"/>
          </filter>
        </defs>

        <!-- Prediction Banner (Under the vertically centered game section box, black text on white highlight) -->
        <g filter="url(#predShadow)">
          <!-- White Highlight Box (Positioned right below centered game box at y=1060) -->
          <rect x="50" y="1060" width="980" height="100" rx="26" fill="#ffffff" fill-opacity="0.80" stroke="#cbd5e1" stroke-width="2.5"/>
          <!-- Black Prediction Text -->
          <text x="540" y="${Math.round(1060 + 50 + predFontSize * 0.35)}" fill="#000000" font-size="${predFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
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
   * - "MATCH X OF N" pill is positioned ON TOP OF the box
   * - Team logos are significantly bigger (size 150)
   * - Snug height matching content (no dead/unnecessary space under team names)
   * - No competition name or kickoff time in the section above
   * - No box around the team names and logo
   * - Center section between teams shows:
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

    // Fetch real team logos for single match showcase (extra enlarged: size 150)
    const logoSize = 150;
    const [homeLogoUri, awayLogoUri] = await Promise.all([
      teamLogoService.getLogoDataUri(game.homeTeam, game.homeTeamLogo, logoSize),
      teamLogoService.getLogoDataUri(game.awayTeam, game.awayTeamLogo, logoSize)
    ]);

    // Adaptive font sizes for team names in the single game section (made slightly smaller)
    const homeFontSize = home.length > 14 ? 24 : 29;
    const awayFontSize = away.length > 14 ? 24 : 29;

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" stop-opacity="0.80"/>
            <stop offset="100%" stop-color="#020617" stop-opacity="0.80"/>
          </linearGradient>
          <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.7"/>
          </filter>
        </defs>

        <g filter="url(#cardShadow)">
          <!-- 1. "MATCH X OF N" Pill - Positioned ON TOP OF the vertically centered box (y=670 to 730) -->
          <rect x="360" y="670" width="360" height="60" rx="30" fill="#0369a1" fill-opacity="0.80" stroke="#38bdf8" stroke-width="2.5"/>
          <text x="540" y="710" fill="#ffffff" font-size="26" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
            MATCH ${matchIndex} OF ${totalMatches}
          </text>

          <!-- 2. Vertically Centered Game Section Box (height 290, y=750 to 1040) -->
          <rect x="50" y="750" width="980" height="290" rx="36" fill="url(#cardGrad)" stroke="#38bdf8" stroke-width="3"/>

          <!-- TEAMS & CENTER MATCH INFO SECTION (No enclosing boxes around teams, extra large logos) -->
          <!-- HOME TEAM (Left, centered at x=220) -->
          <image href="${homeLogoUri}" x="145" y="786" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="220" y="982" fill="#ffffff" font-size="${homeFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
            ${home}
          </text>

          <!-- CENTER SECTION (Competition above, Time in middle, Date under) -->
          <!-- Above Time: Competition Name -->
          <text x="540" y="852" fill="#38bdf8" font-size="24" font-weight="800" font-family="Arial, sans-serif" text-anchor="middle">
            🏆 ${comp}
          </text>
          <!-- Middle: Kickoff Time (made smaller) -->
          <text x="540" y="906" fill="#ffffff" font-size="36" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
            ${timeAmPm}
          </text>
          <!-- Under Time: Date (Tomorrow / dd/mm/yyyy) -->
          <text x="540" y="952" fill="#94a3b8" font-size="22" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
            ${dateText}
          </text>

          <!-- AWAY TEAM (Right, centered at x=860) -->
          <image href="${awayLogoUri}" x="785" y="786" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="860" y="982" fill="#ffffff" font-size="${awayFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
            ${away}
          </text>
        </g>
      </svg>
    `;

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }

  /**
   * Generates a 1080x1920 Matchday Predictions Recap Image.
   * Matches the visual aesthetic of the celebration table:
   * - Unified white card container with sharp borders & soft drop shadow
   * - Real team logos for home and away
   * - Outcome resolution logic:
   *   * If predicted outcome and real outcome are similar / hit: display ONE in green.
   *   * If different / miss: display BOTH predicted and real outcome (with red miss badge).
   *   * If pending: display predicted and pending badge.
   * - Top banner displays overall group outcome (Green HIT, Red MISS, Gray PENDING).
   */
  async generateGroupRecapImage(groupData: any, outputPath: string): Promise<string> {
    const games: any[] = groupData.games || [];
    const count = games.length || 1;
    const targetDate = groupData.targetDate ? this.formatSlashDate(groupData.targetDate) : 'Matchday';
    const groupOutcome: 'PENDING' | 'HIT' | 'MISS' = groupData.groupOutcome || 'PENDING';

    let rowHeight = 190;
    let logoSize = 68;
    let nameFontSize = 32;

    if (count <= 2) {
      rowHeight = 250;
      logoSize = 88;
      nameFontSize = 36;
    } else if (count === 3) {
      rowHeight = 210;
      logoSize = 78;
      nameFontSize = 34;
    } else if (count === 4) {
      rowHeight = 180;
      logoSize = 68;
      nameFontSize = 30;
    } else if (count >= 5) {
      rowHeight = Math.min(170, Math.floor(1000 / count));
      logoSize = 58;
      nameFontSize = 26;
    }

    const tableWidth = 1000;
    const tableX = Math.round((1080 - tableWidth) / 2); // 40
    const titleHeight = 110;
    const gapBetweenTitleAndTable = 24;

    // Fetch real team logos concurrently
    const [homeLogos, awayLogos] = await Promise.all([
      Promise.all(
        games.map((g) => teamLogoService.getLogoDataUri(g.homeTeam, g.homeTeamLogo, logoSize))
      ),
      Promise.all(
        games.map((g) => teamLogoService.getLogoDataUri(g.awayTeam, g.awayTeamLogo, logoSize))
      )
    ]);

    const totalTableHeight = count * rowHeight;
    const combinedHeight = titleHeight + gapBetweenTitleAndTable + totalTableHeight;
    const startY = Math.max(80, Math.round((1920 - combinedHeight) / 2));

    const titleY = startY;
    const tableStartY = titleY + titleHeight + gapBetweenTitleAndTable;

    // Confetti particles if group is HIT
    let confettiSvg = '';
    if (groupOutcome === 'HIT') {
      const confettiColors = ['#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#8b5cf6', '#eab308', '#22c55e', '#ffd700'];
      const confettiElements: string[] = [];
      for (let c = 0; c < 80; c++) {
        const cx = Math.floor(Math.random() * 1040) + 20;
        const cy = Math.floor(Math.random() * 1800) + 60;
        const color = confettiColors[c % confettiColors.length];
        const rot = Math.floor(Math.random() * 360);
        const size = Math.floor(Math.random() * 14) + 8;
        confettiElements.push(
          `<rect x="${cx - size}" y="${cy - Math.round(size / 4)}" width="${size * 2}" height="${Math.round(size * 0.6)}" rx="3" fill="${color}" transform="rotate(${rot} ${cx} ${cy})"/>`
        );
      }
      confettiSvg = confettiElements.join('\n');
    }

    // Determine Title & Header Badge based on groupOutcome
    let headerTitle = 'MATCHDAY RECAP';
    let headerBadgeText = 'PENDING';
    let headerBadgeColor = '#64748b'; // Slate
    let headerIcon = '⏳';

    if (groupOutcome === 'HIT') {
      headerTitle = '🎉 ALL PREDICTIONS HIT 🎉';
      headerBadgeText = '100% SUCCESS';
      headerBadgeColor = '#16a34a'; // Green
      headerIcon = '🏆';
    } else if (groupOutcome === 'MISS') {
      headerTitle = 'MATCHDAY PREDICTIONS RECAP';
      headerBadgeText = 'MISSED';
      headerBadgeColor = '#dc2626'; // Red
      headerIcon = '❌';
    }

    const rowsSvg = games.map((game, i) => {
      const rowY = i * rowHeight;
      const home = this.escapeXml(game.homeTeam);
      const away = this.escapeXml(game.awayTeam);
      const outcome = (game.realOutcome || 'PENDING').toUpperCase();

      const shortPred =
        game.selections && game.selections.length > 1
          ? `${this.formatShortPrediction(game.selections[0].code, game.selections[0].label)} & ${this.formatShortPrediction(game.selections[1].code, game.selections[1].label)}`
          : this.formatShortPrediction(game.selections?.[0]?.code, game.selections?.[0]?.label);

      const rowHalf = rowHeight / 2;
      const homeLogoY = rowY + Math.round((rowHalf - logoSize) / 2);
      const awayLogoY = rowY + Math.round(rowHalf + (rowHalf - logoSize) / 2);

      const homeTextBaselineY = Math.round(homeLogoY + logoSize / 2 + nameFontSize * 0.35);
      const awayTextBaselineY = Math.round(awayLogoY + logoSize / 2 + nameFontSize * 0.35);

      const logoX = 92;
      const nameX = logoX + logoSize + 22;
      const badgeWidth = 320;
      const badgeHeight = rowHeight - 24;

      let badgeContent = '';

      if (outcome === 'HIT') {
        // SIMILAR / HIT: Display ONLY ONE in GREEN!
        const checkRadius = 26;
        const checkCx = badgeWidth - checkRadius - 16;
        const checkCy = Math.round(badgeHeight / 2);
        const pillWidth = checkCx - checkRadius - 20;
        const pillHeight = Math.min(68, Math.round(badgeHeight * 0.55));
        const pillY = Math.round((badgeHeight - pillHeight) / 2);
        const pillFontSize = shortPred.length > 12 ? 20 : shortPred.length > 7 ? 24 : 28;

        const scoreText = game.realScore ? `FT: ${game.realScore}` : '';

        badgeContent = `
          <!-- Section Container on Right -->
          <rect width="${badgeWidth}" height="${badgeHeight}" rx="18" fill="#f0fdf4" fill-opacity="0.95" stroke="#bbf7d0" stroke-width="1.5"/>

          <!-- Green Prediction Pill -->
          <rect x="14" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="14" fill="#22c55e"/>
          <text x="${14 + pillWidth / 2}" y="${Math.round(pillY + pillHeight / 2 + (scoreText ? -4 : pillFontSize * 0.35))}" fill="#000000" font-size="${pillFontSize}" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">
            ${this.escapeXml(shortPred)}
          </text>
          ${scoreText ? `
            <text x="${14 + pillWidth / 2}" y="${Math.round(pillY + pillHeight - 6)}" fill="#064e3b" font-size="14" font-weight="800" font-family="Arial, sans-serif" text-anchor="middle">
              ${this.escapeXml(scoreText)}
            </text>
          ` : ''}

          <!-- Green Check Circle on Right -->
          <circle cx="${checkCx}" cy="${checkCy}" r="${checkRadius}" fill="#16a34a"/>
          <path d="M${checkCx - 10} ${checkCy} L${checkCx - 3} ${checkCy + 8} L${checkCx + 10} ${checkCy - 8}" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        `;
      } else if (outcome === 'MISS') {
        // DIFFERENT / MISS: Display BOTH predicted and real outcome!
        const pillHeight = Math.round((badgeHeight - 20) / 2);
        const pill1Y = 8;
        const pill2Y = pill1Y + pillHeight + 4;
        const innerWidth = badgeWidth - 24;
        const scoreDisplay = game.realScore ? `FT: ${game.realScore}` : 'MISSED';

        badgeContent = `
          <!-- Section Container on Right -->
          <rect width="${badgeWidth}" height="${badgeHeight}" rx="18" fill="#fef2f2" fill-opacity="0.95" stroke="#fecaca" stroke-width="1.5"/>

          <!-- 1. Predicted Pill (Top) -->
          <rect x="12" y="${pill1Y}" width="${innerWidth}" height="${pillHeight}" rx="10" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
          <text x="24" y="${Math.round(pill1Y + pillHeight / 2 + 5)}" fill="#64748b" font-size="14" font-weight="bold" font-family="Arial, sans-serif">
            PRED:
          </text>
          <text x="${innerWidth}" y="${Math.round(pill1Y + pillHeight / 2 + 5)}" fill="#0f172a" font-size="16" font-weight="900" font-family="Arial, sans-serif" text-anchor="end">
            ${this.escapeXml(shortPred)}
          </text>

          <!-- 2. Real Outcome Pill (Bottom - Red with Cross) -->
          <rect x="12" y="${pill2Y}" width="${innerWidth}" height="${pillHeight}" rx="10" fill="#fee2e2" stroke="#fca5a5" stroke-width="1"/>
          <text x="24" y="${Math.round(pill2Y + pillHeight / 2 + 5)}" fill="#dc2626" font-size="14" font-weight="900" font-family="Arial, sans-serif">
            REAL:
          </text>
          <text x="${innerWidth - 22}" y="${Math.round(pill2Y + pillHeight / 2 + 5)}" fill="#dc2626" font-size="16" font-weight="900" font-family="Arial, sans-serif" text-anchor="end">
            ${this.escapeXml(scoreDisplay)}
          </text>
          <!-- Red cross icon -->
          <circle cx="${innerWidth}" cy="${Math.round(pill2Y + pillHeight / 2)}" r="9" fill="#dc2626"/>
          <path d="M${innerWidth - 4} ${Math.round(pill2Y + pillHeight / 2) - 4} L${innerWidth + 4} ${Math.round(pill2Y + pillHeight / 2) + 4} M${innerWidth + 4} ${Math.round(pill2Y + pillHeight / 2) - 4} L${innerWidth - 4} ${Math.round(pill2Y + pillHeight / 2) + 4}" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
        `;
      } else {
        // PENDING
        const pillHeight = Math.round((badgeHeight - 20) / 2);
        const pill1Y = 8;
        const pill2Y = pill1Y + pillHeight + 4;
        const innerWidth = badgeWidth - 24;

        badgeContent = `
          <!-- Section Container on Right -->
          <rect width="${badgeWidth}" height="${badgeHeight}" rx="18" fill="#f8fafc" fill-opacity="0.95" stroke="#e2e8f0" stroke-width="1.5"/>

          <!-- 1. Predicted Pill (Top) -->
          <rect x="12" y="${pill1Y}" width="${innerWidth}" height="${pillHeight}" rx="10" fill="#e0f2fe" stroke="#bae6fd" stroke-width="1"/>
          <text x="24" y="${Math.round(pill1Y + pillHeight / 2 + 5)}" fill="#0284c7" font-size="14" font-weight="bold" font-family="Arial, sans-serif">
            PRED:
          </text>
          <text x="${innerWidth}" y="${Math.round(pill1Y + pillHeight / 2 + 5)}" fill="#0369a1" font-size="16" font-weight="900" font-family="Arial, sans-serif" text-anchor="end">
            ${this.escapeXml(shortPred)}
          </text>

          <!-- 2. Status Pill (Bottom) -->
          <rect x="12" y="${pill2Y}" width="${innerWidth}" height="${pillHeight}" rx="10" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
          <text x="${12 + innerWidth / 2}" y="${Math.round(pill2Y + pillHeight / 2 + 5)}" fill="#64748b" font-size="14" font-weight="800" font-family="Arial, sans-serif" text-anchor="middle">
            ⏳ PENDING
          </text>
        `;
      }

      const isLastRow = i === games.length - 1;
      const dividerSvg = !isLastRow
        ? `<line x1="20" y1="${rowY + rowHeight}" x2="${tableWidth - 20}" y2="${rowY + rowHeight}" stroke="#cbd5e1" stroke-width="2"/>`
        : '';

      return `
        <!-- Game Row ${i + 1} -->
        <g>
          <!-- Match Index Circle on Left -->
          <circle cx="48" cy="${rowY + Math.round(rowHeight / 2)}" r="28" fill="#f1f5f9" fill-opacity="0.9" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="48" y="${rowY + Math.round(rowHeight / 2 + 8)}" fill="#0f172a" font-size="24" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle">${i + 1}</text>

          <!-- Vertical Divider between index badge and teams -->
          <line x1="80" y1="${rowY + 12}" x2="80" y2="${rowY + rowHeight - 12}" stroke="#f1f5f9" stroke-width="2"/>

          <!-- HOME TEAM -->
          <image href="${homeLogos[i]}" x="${logoX}" y="${homeLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="${nameX}" y="${homeTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${home}
          </text>

          <!-- Divider between Home & Away inside row -->
          <line x1="${logoX}" y1="${rowY + Math.round(rowHalf)}" x2="${tableWidth - (badgeWidth + 28)}" y2="${rowY + Math.round(rowHalf)}" stroke="#f1f5f9" stroke-width="1.5"/>

          <!-- AWAY TEAM -->
          <image href="${awayLogos[i]}" x="${logoX}" y="${awayLogoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
          <text x="${nameX}" y="${awayTextBaselineY}" fill="#0f172a" font-size="${nameFontSize}" font-weight="800" font-family="Arial, sans-serif" text-anchor="start">
            ${away}
          </text>

          <!-- Outcome / Prediction Section on Right -->
          <g transform="translate(${tableWidth - (badgeWidth + 18)}, ${rowY + Math.round((rowHeight - badgeHeight) / 2)})">
            ${badgeContent}
          </g>

          ${dividerSvg}
        </g>
      `;
    }).join('\n');

    const svg = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="50%" stop-color="#090d16"/>
            <stop offset="100%" stop-color="#020617"/>
          </linearGradient>
          <filter id="recapShadow" x="-5%" y="-10%" width="110%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.6"/>
          </filter>
        </defs>

        <!-- Background Gradient -->
        <rect width="1080" height="1920" fill="url(#bgGrad)"/>

        <!-- Festive Confetti Background (if HIT) -->
        ${confettiSvg}

        <!-- 1. TITLE & OUTCOME HEADER BOX -->
        <g filter="url(#recapShadow)" transform="translate(${tableX}, ${titleY})">
          <rect width="${tableWidth}" height="${titleHeight}" rx="24" fill="#ffffff" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="2.5"/>
          
          <!-- Outcome Badge at Top of Title -->
          <rect x="${tableWidth / 2 - 120}" y="12" width="240" height="32" rx="16" fill="${headerBadgeColor}"/>
          <text x="${tableWidth / 2}" y="33" fill="#ffffff" font-size="16" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
            ${headerIcon} ${headerBadgeText}
          </text>

          <!-- Main Title Text -->
          <text x="${tableWidth / 2}" y="74" fill="#0f172a" font-size="32" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">
            ${this.escapeXml(headerTitle)}
          </text>

          <!-- Target Date Subtitle -->
          <text x="${tableWidth / 2}" y="98" fill="#64748b" font-size="18" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
            📅 ${this.escapeXml(targetDate)}
          </text>
        </g>

        <!-- 2. GAME RECAP TABLE -->
        <g filter="url(#recapShadow)" transform="translate(${tableX}, ${tableStartY})">
          <!-- Unified White Table Background -->
          <rect width="${tableWidth}" height="${totalTableHeight}" rx="24" fill="#ffffff" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="2.5"/>

          <!-- Match Rows & Dividers -->
          ${rowsSvg}
        </g>

        <!-- 3. BRANDING FOOTER -->
        <text x="540" y="${Math.min(1880, tableStartY + totalTableHeight + 50)}" fill="#64748b" font-size="20" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">
          ⚽ GoalCast Studio • AI Match Predictions
        </text>
      </svg>
    `;

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }
}

export const overlayGenerator = new OverlayGenerator();
