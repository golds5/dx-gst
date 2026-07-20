// Display labels shared by the browser code and the API functions.
import type { BrandConfig } from '../config.js';

export function brandCellLabel(brand: BrandConfig): string {
  return brand.isCompetitor ? brand.name : `${brand.group} - ${brand.name}`;
}

// Device is now tester-reported free text — the label is stored directly.
export function deviceLabelFor(device: string): string {
  return device;
}

// Heatmap Game column (D): "Provider - Game" so each game is its own row and
// never collides with another game from the same provider.
export function gameSheetLabelFor(provider: string, game: string): string {
  return `${provider} - ${game}`;
}
