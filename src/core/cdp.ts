/**
 * Hand-written types for the slice of the Chrome DevTools Protocol we use.
 *
 * Only `Page.printToPDF` is needed. Its dimensions are all in INCHES; see
 * https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF
 */

export type CdpMethod = 'Page.printToPDF' | 'Page.enable' | 'Page.getLayoutMetrics';

/** `printToPDF` transferMode: we always want the base64 result inline. */
export type PrintTransferMode = 'ReturnAsBase64' | 'ReturnAsStream';

export interface PrintToPdfParams {
  landscape?: boolean;
  displayHeaderFooter?: boolean;
  printBackground?: boolean;
  /** 0.1 - 2.0 as enforced by Chrome. */
  scale?: number;
  paperWidth?: number;
  paperHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  /** e.g. "1-5, 8, 11-13"; empty/absent means all pages. */
  pageRanges?: string;
  headerTemplate?: string;
  footerTemplate?: string;
  preferCSSPageSize?: boolean;
  transferMode?: PrintTransferMode;
  generateTaggedPDF?: boolean;
}

export interface PrintToPdfResult {
  /** base64-encoded PDF bytes. */
  data: string;
  /** Present only when transferMode is ReturnAsStream. */
  stream?: string;
}

export interface LayoutMetricsResult {
  cssContentSize?: { width: number; height: number };
  contentSize?: { width: number; height: number };
}

export interface CdpCommandMap {
  'Page.enable': { params: Record<string, never>; result: Record<string, never> };
  'Page.printToPDF': { params: PrintToPdfParams; result: PrintToPdfResult };
  'Page.getLayoutMetrics': { params: Record<string, never>; result: LayoutMetricsResult };
}

export function isPrintToPdfResult(value: unknown): value is PrintToPdfResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PrintToPdfResult).data === 'string' &&
    (value as PrintToPdfResult).data.length > 0
  );
}
