// Tiny element builders. Text always goes in as text nodes, never as HTML,
// so nothing a user types can be interpreted as markup.

const SVG_NS = 'http://www.w3.org/2000/svg';
const AS_PROPERTY = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'required', 'readOnly', 'open', 'textContent']);

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function apply(el, props, isSvg) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'style') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (!isSvg && AS_PROPERTY.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  apply(el, props, false);
  return append(el, children);
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, props, true);
  return append(el, children);
}

let counter = 0;
export const uid = (prefix = 'id') => `${prefix}-${++counter}`;
