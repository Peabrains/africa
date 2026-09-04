'use strict';

/* Shared, deliberately small helpers for Budget's equal-split view. */
const BudgetSharing = (() => {
  function normalizeSelection(selection, travelers) {
    const allowed = Array.isArray(travelers) ? travelers : [];
    const selected = Array.isArray(selection) ? selection.filter(name => allowed.includes(name)) : [];
    return selected.length ? [...new Set(selected)] : [...allowed];
  }

  function perPerson(total, selected) {
    const count = Array.isArray(selected) ? selected.length : 0;
    return count ? (Number(total) || 0) / count : 0;
  }

  function groupByCategory(items) {
    return (items || []).reduce((groups, item) => {
      const category = item.category || 'Other';
      if (!groups[category]) groups[category] = { total: 0, items: [] };
      groups[category].total += Number(item.categoryCost ?? item.cost) || 0;
      groups[category].items.push(item);
      return groups;
    }, {});
  }

  function total(items) {
    return (items || []).reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  }

  function selectionLabel(selected) {
    return Array.isArray(selected) && selected.length ? selected.join(' + ') : 'Select';
  }

  return { normalizeSelection, perPerson, groupByCategory, total, selectionLabel };
})();

if (typeof window !== 'undefined') window.BudgetSharing = BudgetSharing;
