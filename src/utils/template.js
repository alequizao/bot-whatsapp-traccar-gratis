'use strict';

function getPath(source, path) {
  return path.split('.').reduce((current, segment) => {
    if (current === undefined || current === null) return '';
    return current[segment];
  }, source);
}

function renderTemplate(template, context) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = getPath(context, key);
    if (value === undefined || value === null || value === '') return 'N/D';
    return String(value);
  });
}

function stateLabels(state) {
  return {
    status: state.status || 'unknown',
    ignitionText: state.ignition === true ? 'Ligada' : state.ignition === false ? 'Desligada' : 'N/D',
    motionText: state.motion === true ? 'Em movimento' : state.motion === false ? 'Parado' : 'N/D',
  };
}

module.exports = { renderTemplate, stateLabels };
