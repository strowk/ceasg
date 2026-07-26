const SVG_NS = 'http://www.w3.org/2000/svg';

export class Overlay {
  private g: SVGGElement;
  constructor(svg: SVGSVGElement) {
    this.g = document.createElementNS(SVG_NS, 'g');
    this.g.setAttribute('class', 'ceasg-overlay');
    svg.appendChild(this.g);
  }
  clear(): void { this.g.innerHTML = ''; }
  outline(x: number, y: number, w: number, h: number, cls = 'ceasg-sel'): void {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
    r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
    r.setAttribute('class', cls);
    this.g.appendChild(r);
  }
  marquee(x: number, y: number, w: number, h: number): void { this.outline(x, y, w, h, 'ceasg-marquee'); }
  ghostLine(x1: number, y1: number, x2: number, y2: number): void {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('class', 'ceasg-ghost');
    this.g.appendChild(l);
  }
}
