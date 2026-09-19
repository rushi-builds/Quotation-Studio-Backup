/* ==========================================================================
   KTM Solar Platform — Solar Design Engine
   --------------------------------------------------------------------------
   Engineering rule: No guessing. No arbitrary assumptions.
   If required input is missing, outputs are null / 'DATA REQUIRED'.
   ========================================================================== */
'use strict';

const SolarEngine = (() => {

  /* ── Module count ───────────────────────────────────────────────────────
   * @param {number} capacityKwp   System capacity in kWp
   * @param {number} moduleWp      Individual module rated power in Wp
   * @returns {number|null}        Number of modules (rounded up), or null
   * ─────────────────────────────────────────────────────────────────────── */
  function calcModuleCount(capacityKwp, moduleWp) {
    if (!capacityKwp || !moduleWp || capacityKwp <= 0 || moduleWp <= 0) return null;
    return Math.ceil((capacityKwp * 1000) / moduleWp);
  }

  /* ── Actual installed capacity ── */
  function calcInstalledKwp(moduleCount, moduleWp) {
    if (!moduleCount || !moduleWp) return null;
    return (moduleCount * moduleWp) / 1000;
  }

  /* ── Area required ──────────────────────────────────────────────────────
   * PLANNING / LAYOUT ASSUMPTION:
   * The utilizationFactor (default 0.75) is a preliminary layout planning
   * benchmark accounting for inter-row shadow pitch, maintenance walkways,
   * inverter clearance, and edge setbacks.
   * This is NOT a verified final site engineering measurement.
   * Final usable roof area requires on-site structural and shadow survey.
   *
   * @param {number} moduleCount
   * @param {object} dims               { lengthMm, widthMm }  module dimensions
   * @param {number} utilizationFactor  0.75 default planning/layout assumption
   * @returns {number|null}             Estimated planning area in m²
   * ─────────────────────────────────────────────────────────────────────── */
  function calcAreaRequired(moduleCount, dims, utilizationFactor = 0.75) {
    if (!moduleCount || !dims?.lengthMm || !dims?.widthMm) return null;
    const netModuleArea = (dims.lengthMm / 1000) * (dims.widthMm / 1000) * moduleCount; // m²
    // Gross planning roof area needed considering pitch & walkways
    return Math.ceil(netModuleArea / utilizationFactor);
  }

  /* ── String configuration ───────────────────────────────────────────────
   * Basic string sizing: maximize series modules per MPPT voltage window.
   * @param {number} moduleCount
   * @param {object} module        { voc, vmp }  volts
   * @param {object} inverter      { mpptCount, vmpptMin, vmpptMax, vmaxDC }
   * @returns {object|null}        { seriesPerString, parallelStrings, config }
   * ─────────────────────────────────────────────────────────────────────── */
  function calcStringConfig(moduleCount, module, inverter) {
    if (!moduleCount || !module?.vmp || !inverter?.vmpptMin || !inverter?.vmpptMax) return null;
    // Max series limited by max DC voltage and MPPT max
    const maxSeriesVoc = Math.floor(inverter.vmaxDC / module.voc);
    const maxSeriesVmp = Math.floor(inverter.vmpptMax / module.vmp);
    const maxSeries    = Math.min(maxSeriesVoc, maxSeriesVmp);
    // Min series to stay above MPPT minimum
    const minSeries    = Math.ceil(inverter.vmpptMin / module.vmp);
    if (maxSeries < minSeries) return null; // incompatible

    // Try to find a clean series count that divides module count evenly
    let bestSeries = maxSeries;
    for (let s = maxSeries; s >= minSeries; s--) {
      if (moduleCount % s === 0) { bestSeries = s; break; }
    }
    const parallel = Math.ceil(moduleCount / bestSeries);
    return {
      seriesPerString: bestSeries,
      parallelStrings: parallel,
      config: `${bestSeries}S × ${parallel}P`,
    };
  }

  /* ── DC/AC ratio ── */
  function calcDCACRatio(installedKwp, inverterKw) {
    if (!installedKwp || !inverterKw || inverterKw <= 0) return null;
    return installedKwp / inverterKw;
  }

  /* ── Run full design from inputs ────────────────────────────────────────
   * Convenience wrapper. Returns all design outputs.
   * @param {object} params
   *   capacityKwp, module (Equipment object), inverter (Equipment object)
   * ─────────────────────────────────────────────────────────────────────── */
  function runDesign(params) {
    const { capacityKwp, module: mod, inverter: inv } = params;
    const moduleCount    = calcModuleCount(capacityKwp, mod?.wp);
    const installedKwp   = calcInstalledKwp(moduleCount, mod?.wp);
    const areaRequired   = calcAreaRequired(moduleCount, mod?.dimensions);
    const stringConfig   = calcStringConfig(moduleCount, mod, inv);
    const dcacRatio      = calcDCACRatio(installedKwp, inv?.ratedPowerKw);

    return {
      moduleCount,
      installedKwp,
      areaRequired,
      stringConfig: stringConfig?.config || null,
      seriesPerString: stringConfig?.seriesPerString || null,
      parallelStrings: stringConfig?.parallelStrings || null,
      dcacRatio,
    };
  }

  /* ── Validation ── */
  function validateDesign(design) {
    const issues = [];
    if (!design.moduleCount)  issues.push('Module count (check capacity + module Wp)');
    if (!design.areaRequired) issues.push('Area (check module dimensions)');
    if (!design.stringConfig) issues.push('String config (check inverter MPPT voltage range)');
    if (design.dcacRatio) {
      if (design.dcacRatio < 0.9) issues.push(`DC/AC ratio ${design.dcacRatio.toFixed(2)} is below 0.9 — undersized inverter`);
      if (design.dcacRatio > 1.4) issues.push(`DC/AC ratio ${design.dcacRatio.toFixed(2)} exceeds 1.4 — oversized DC`);
    }
    return { valid: issues.length === 0, warnings: issues };
  }

  return { calcModuleCount, calcInstalledKwp, calcAreaRequired, calcStringConfig, calcDCACRatio, runDesign, validateDesign };
})();
