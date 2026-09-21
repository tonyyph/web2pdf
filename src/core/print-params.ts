import type { PrintToPdfParams } from './cdp';
import {
  MARGIN_PRESETS_IN,
  PAPER_SIZES,
  SCALE_MAX,
  SCALE_MIN,
  type MarginSpec,
  type PaperSpec,
} from './constants';
import { buildFooterTemplate, buildHeaderTemplate } from './header-footer';
import type { Settings } from './settings/schema';
import { customPaperInches, isValidPageRanges } from './settings/validate';
import { clamp, MAX_PAPER_INCHES, MIN_PAPER_INCHES, toInches } from './units';

export interface PrintContext {
  title: string;
  url: string;
}

function paperSpecToInches(spec: PaperSpec): { width: number; height: number } {
  return {
    width: toInches(spec.width, spec.unit),
    height: toInches(spec.height, spec.unit),
  };
}

/** Portrait paper dimensions in inches for the configured paper size. */
export function resolvePaperInches(settings: Settings): { width: number; height: number } {
  const { paperSize, customPaper } = settings.page;
  if (paperSize === 'custom') return customPaperInches(customPaper);
  const spec = PAPER_SIZES[paperSize];
  return paperSpecToInches(spec);
}

/** Margins in inches, honouring the preset or the custom millimetre values. */
export function resolveMarginsInches(settings: Settings): MarginSpec {
  const { marginPreset, customMargins } = settings.page;
  if (marginPreset !== 'custom') return MARGIN_PRESETS_IN[marginPreset];
  return {
    top: toInches(customMargins.topMm, 'mm'),
    right: toInches(customMargins.rightMm, 'mm'),
    bottom: toInches(customMargins.bottomMm, 'mm'),
    left: toInches(customMargins.leftMm, 'mm'),
  };
}

/**
 * Build the exact `Page.printToPDF` payload.
 *
 * Landscape is expressed with the `landscape` flag rather than by swapping
 * width/height - Chrome rotates the portrait paper itself, and swapping as
 * well would cancel the rotation out.
 */
export function buildPrintParams(settings: Settings, context: PrintContext): PrintToPdfParams {
  const paper = resolvePaperInches(settings);
  const margins = resolveMarginsInches(settings);
  const headerFooterEnabled = settings.headerFooter.enabled;

  const paperWidth = clamp(paper.width, MIN_PAPER_INCHES, MAX_PAPER_INCHES);
  const paperHeight = clamp(paper.height, MIN_PAPER_INCHES, MAX_PAPER_INCHES);

  // Margins must leave a positive printable area or Chrome rejects the call.
  const maxHorizontal = Math.max(0, (paperWidth - 0.2) / 2);
  const maxVertical = Math.max(0, (paperHeight - 0.2) / 2);

  const params: PrintToPdfParams = {
    landscape: settings.page.orientation === 'landscape',
    displayHeaderFooter: headerFooterEnabled,
    printBackground: settings.cleanup.includeBackgrounds,
    scale: clamp(settings.page.scale, SCALE_MIN, SCALE_MAX),
    paperWidth,
    paperHeight,
    marginTop: clamp(margins.top, 0, maxVertical),
    marginBottom: clamp(margins.bottom, 0, maxVertical),
    marginLeft: clamp(margins.left, 0, maxHorizontal),
    marginRight: clamp(margins.right, 0, maxHorizontal),
    preferCSSPageSize: settings.page.preferCssPageSize,
    transferMode: 'ReturnAsBase64',
  };

  const ranges = settings.page.pageRanges.trim();
  if (ranges !== '' && isValidPageRanges(ranges)) {
    params.pageRanges = ranges;
  }

  if (headerFooterEnabled) {
    params.headerTemplate = buildHeaderTemplate(settings.headerFooter, context);
    params.footerTemplate = buildFooterTemplate(settings.headerFooter, context);
  }

  return params;
}
