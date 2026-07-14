// Display labels shared by the browser code and the API functions.
import { DEVICES, GAMES } from '../config';
import type { BrandConfig } from '../config';

export function brandCellLabel(brand: BrandConfig): string {
  return brand.isCompetitor ? brand.name : `${brand.group} - ${brand.name}`;
}

export function deviceLabelFor(deviceId: string): string {
  return DEVICES.find((d) => d.id === deviceId)?.label ?? deviceId;
}

export function gameSheetLabelFor(provider: string, game: string): string {
  return (
    GAMES.find((g) => g.provider === provider && g.game === game)?.sheetLabel ?? provider
  );
}
