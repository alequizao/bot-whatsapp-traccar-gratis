'use strict';

function normalizePhoneNumber(value) {
  if (!value) return null;

  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55')) {
    const local = digits.slice(2);
    if (local.length === 11) return digits;
    if (local.length === 10) return `55${local[0]}9${local.slice(1)}`;
    return digits;
  }

  if (digits.length === 10) return `55${digits[0]}9${digits.slice(1)}`;
  if (digits.length === 11) return `55${digits}`;

  return digits;
}

function maskPhoneNumber(value) {
  if (!value) return null;

  const digits = String(value).replace(/\D/g, '');
  if (digits.length <= 4) return '****';

  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
}

module.exports = { normalizePhoneNumber, maskPhoneNumber };
