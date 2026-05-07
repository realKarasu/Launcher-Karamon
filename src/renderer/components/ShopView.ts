import type { LauncherApi } from '../../ipc/contract';
import { $ } from '../util/dom';

const PAYPAL_URL = 'https://paypal.me/AntoineOhayo';

interface KitOption {
  id: string;
  name: string;
  price: number;
  accent: string;
  accent2?: string;
  badge: string;
  summary: string;
  items: string[];
}

interface KeyPriceOption {
  id: string;
  label: string;
  quantity: number;
  price: number;
}

interface KeyOption {
  id: string;
  name: string;
  accent: string;
  accent2?: string;
  summary: string;
  options: KeyPriceOption[];
  highlights: string[];
}

const SHOP_KITS: KitOption[] = [
  {
    id: 'mvp',
    name: 'MVP',
    price: 5,
    accent: '#19d7ff',
    accent2: '#13a7ff',
    badge: 'Grade Premium',
    summary: 'Un premier boost solide pour démarrer avec confort, stockage et clés.',
    items: [
      '32 Ultra Balls',
      '1 Master Ball',
      '1 PC + 1 Machine de soin',
      '1 Max Revive',
      '1 Sac à dos Diamant',
      '5 Clés Rares',
      '3 Clés Épiques',
      '1 Plushie aléatoire Normal',
    ],
  },
  {
    id: 'mvpplus',
    name: 'MVP+',
    price: 10,
    accent: '#8c5cff',
    accent2: '#db5cff',
    badge: 'Meilleur Équilibre',
    summary: 'Plus de Master Balls, des Fossiles Shiny et des clés haut niveau.',
    items: [
      '64 Ultra Balls',
      '6 Master Balls',
      '1 PC + 1 Machine de soin',
      '3 Max Revive',
      '2 Fossiles Shiny',
      '1 Sac à dos Diamant',
      '3 Clés Légendaires',
      '4 Clés Épiques',
      '1 Plushie Normal + 1 Plushie Shiny',
    ],
  },
  {
    id: 'star',
    name: 'STAR',
    price: 30,
    accent: '#ffcc33',
    accent2: '#ffe57a',
    badge: 'Top Grade',
    summary: 'Le kit le plus complet — Backpack Nétherite, Clés Spéciales et bien plus.',
    items: [
      '128 Ultra Balls',
      '15 Master Balls',
      '1 PC + 1 Machine de soin',
      '6 Max Revive',
      '3 Fossiles Shiny',
      '1 Sac à dos Nétherite',
      '2 Clés Spéciales',
      '3 Clés Légendaires',
      '5 Clés Épiques',
      '1 Plushie Légendaire + 1 Plushie Shiny',
    ],
  },
];

const SHOP_KEYS: KeyOption[] = [
  {
    id: 'epic',
    name: 'Clé Épique',
    accent: '#b36cff',
    summary: 'Progression avancée avec Shiny Charm, Ultimate Candy et récompenses rares.',
    options: [
      { id: 'unit', label: 'Unité', quantity: 1, price: 2.99 },
      { id: 'pack5', label: 'Pack de 5', quantity: 5, price: 7.99 },
    ],
    highlights: [
      'Great Balls & Ultra Balls en quantité',
      'Clés Rare, Épique ou Légendaire',
      'Shiny Charm & Ultimate Candy',
      'Chance de Plushie Légendaire',
    ],
  },
  {
    id: 'legendary',
    name: 'Clé Légendaire',
    accent: '#ff9f1c',
    summary: 'La clé haut niveau pour viser les drops qui changent une aventure.',
    options: [
      { id: 'unit', label: 'Unité', quantity: 1, price: 4.99 },
      { id: 'pack5', label: 'Pack de 5', quantity: 5, price: 11.99 },
    ],
    highlights: [
      'Ultra Balls & Master Balls',
      'Shiny Charm & Fossile Shiny',
      'Clés Épique, Légendaire ou Spéciale',
      'Chance de Plushie Shiny ou Légendaire',
    ],
  },
  {
    id: 'special',
    name: 'Clé Spéciale',
    accent: '#ff4655',
    summary: 'La clé la plus rare — drops puissants, exclusifs et très limités.',
    options: [
      { id: 'unit', label: 'Unité', quantity: 1, price: 9.99 },
      { id: 'pack5', label: 'Pack de 5', quantity: 5, price: 29.99 },
    ],
    highlights: [
      'Master Balls en gros lot',
      'Ultimate Candy & Fossile Shiny',
      'Clés Légendaire ou Spéciale',
      'Chance de Bâton Admin ou Arceus Shiny ✦',
    ],
  },
];

interface CartItem {
  sku: string;
  name: string;
  detail: string;
  price: number;
  count: number;
}

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const formatPrice = (n: number): string => money.format(n);

export class ShopView {
  private readonly api: LauncherApi;
  private cart: CartItem[] = [];
  private rendered = false;

  constructor(api: LauncherApi) {
    this.api = api;
  }

  attach(): void {
    if (this.rendered) return;
    this.renderKits();
    this.renderKeys();
    this.renderCart();
    this.attachCheckout();
    this.rendered = true;
  }

  private renderKits(): void {
    const grid = $('shop-kits-grid');
    grid.textContent = '';
    for (const kit of SHOP_KITS) {
      const accent2 = kit.accent2 ?? kit.accent;
      const card = document.createElement('article');
      card.className = 'product-card';
      card.style.setProperty('--accent', kit.accent);
      card.style.setProperty('--accent-2', accent2);

      const top = document.createElement('div');
      top.className = 'product-card__top';
      const badge = document.createElement('span');
      badge.textContent = kit.badge;
      const code = document.createElement('code');
      code.textContent = `/kit ${kit.id}`;
      top.append(badge, code);

      const title = document.createElement('h3');
      title.textContent = kit.name;

      const price = document.createElement('strong');
      price.className = 'product-price';
      price.textContent = formatPrice(kit.price);

      const summary = document.createElement('p');
      summary.textContent = kit.summary;

      const list = document.createElement('ul');
      for (const item of kit.items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-primary product-action';
      button.textContent = 'Ajouter au panier';
      button.style.background = `linear-gradient(135deg, ${kit.accent}, ${accent2})`;
      button.addEventListener('click', () => this.addItem({
        sku: `kit:${kit.id}`,
        name: `Grade ${kit.name}`,
        detail: 'Grade Karamon',
        price: kit.price,
        count: 1,
      }));

      card.append(top, title, price, summary, list, button);
      grid.appendChild(card);
    }
  }

  private renderKeys(): void {
    const grid = $('shop-keys-grid');
    grid.textContent = '';
    for (const key of SHOP_KEYS) {
      const accent2 = key.accent2 ?? key.accent;
      const card = document.createElement('article');
      card.className = 'key-card';
      card.style.setProperty('--accent', key.accent);
      card.style.setProperty('--accent-2', accent2);

      const gem = ShopView.gemSvg(key.id, key.accent, accent2);
      card.appendChild(gem);

      const head = document.createElement('div');
      const tier = document.createElement('span');
      tier.className = 'key-card__tier';
      tier.textContent = 'Lootbox Karamon';
      const title = document.createElement('h3');
      title.textContent = key.name;
      const summary = document.createElement('p');
      summary.textContent = key.summary;
      head.append(tier, title, summary);

      const opts = document.createElement('div');
      opts.className = 'price-options';
      for (const option of key.options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const label = document.createElement('span');
        label.textContent = option.label;
        const priceEl = document.createElement('strong');
        priceEl.textContent = formatPrice(option.price);
        btn.append(label, priceEl);
        btn.addEventListener('click', () => this.addItem({
          sku: `key:${key.id}:${option.id}`,
          name: `${key.name} — ${option.label}`,
          detail: `${option.quantity} clé${option.quantity > 1 ? 's' : ''}`,
          price: option.price,
          count: 1,
        }));
        opts.appendChild(btn);
      }

      const list = document.createElement('ul');
      for (const item of key.highlights) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }

      card.append(head, opts, list);
      grid.appendChild(card);
    }
  }

  private static gemSvg(id: string, accent: string, accent2: string): SVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'key-gem');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <defs>
        <linearGradient id="gem-${id}-a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${accent2}" stop-opacity="0.55"/>
        </linearGradient>
        <linearGradient id="gem-${id}-b" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="white" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="white" stop-opacity="0.04"/>
        </linearGradient>
      </defs>
      <polygon points="32,4 60,24 32,60 4,24" fill="url(#gem-${id}-a)"/>
      <polygon points="4,24 32,4 32,24" fill="rgba(255,255,255,0.18)"/>
      <polygon points="32,4 60,24 32,24" fill="url(#gem-${id}-b)"/>
      <polygon points="32,60 60,24 32,38 4,24" fill="rgba(0,0,0,0.18)"/>
      <polygon points="32,4 60,24 32,60 4,24" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    `;
    return svg;
  }

  private addItem(item: CartItem): void {
    const existing = this.cart.find((c) => c.sku === item.sku);
    if (existing) existing.count += 1;
    else this.cart.push({ ...item });
    this.renderCart();
  }

  private updateCount(sku: string, delta: number): void {
    const idx = this.cart.findIndex((c) => c.sku === sku);
    if (idx === -1) return;
    this.cart[idx].count += delta;
    if (this.cart[idx].count <= 0) this.cart.splice(idx, 1);
    this.renderCart();
  }

  private removeItem(sku: string): void {
    this.cart = this.cart.filter((c) => c.sku !== sku);
    this.renderCart();
  }

  private cartCount(): number {
    return this.cart.reduce((t, i) => t + i.count, 0);
  }

  private cartTotal(): number {
    return this.cart.reduce((t, i) => t + i.price * i.count, 0);
  }

  private renderCart(): void {
    const count = this.cartCount();
    const total = this.cartTotal();

    $('shop-cart-count').textContent = `${count} item${count !== 1 ? 's' : ''}`;
    $('shop-cart-total').textContent = formatPrice(total);

    const body = $('shop-cart-body');
    body.textContent = '';

    if (this.cart.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cart-panel__empty';
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" style="opacity:.35">
          <path d="M6.2 6h15l-1.7 8.5H8.1L6.2 3.5H3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="9" cy="20" r="1.6" fill="currentColor"/>
          <circle cx="18" cy="20" r="1.6" fill="currentColor"/>
        </svg>
        <p>Ton panier est vide.</p>
      `;
      body.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'cart-list';
      for (const item of this.cart) {
        const li = document.createElement('li');

        const info = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = item.name;
        const detail = document.createElement('span');
        detail.textContent = `${item.detail} — ${formatPrice(item.price)}`;
        info.append(name, detail);

        const qty = document.createElement('div');
        qty.className = 'cart-qty';
        const minus = document.createElement('button');
        minus.type = 'button';
        minus.textContent = '−';
        minus.addEventListener('click', () => this.updateCount(item.sku, -1));
        const cnt = document.createElement('span');
        cnt.textContent = String(item.count);
        const plus = document.createElement('button');
        plus.type = 'button';
        plus.textContent = '+';
        plus.addEventListener('click', () => this.updateCount(item.sku, 1));
        qty.append(minus, cnt, plus);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'cart-remove';
        remove.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        remove.addEventListener('click', () => this.removeItem(item.sku));

        li.append(info, qty, remove);
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    const checkout = $('shop-checkout-btn') as HTMLButtonElement;
    checkout.disabled = this.cart.length === 0;
    checkout.textContent = this.cart.length === 0
      ? 'Panier vide'
      : `Checkout — ${formatPrice(total)}`;

    const error = $('shop-cart-error');
    error.hidden = true;
    error.textContent = '';
  }

  private attachCheckout(): void {
    const backdrop = $('checkout-backdrop');
    const closeBtn = $('checkout-close');
    const form = $('checkout-form') as HTMLFormElement;
    const errorEl = $('checkout-error');
    const successEl = $('checkout-success');
    const usernameInput = $('checkout-username') as HTMLInputElement;

    const close = (): void => backdrop.classList.remove('show');

    $('shop-checkout-btn').addEventListener('click', () => {
      if (this.cart.length === 0) {
        const e = $('shop-cart-error');
        e.textContent = 'Ajoute au moins un item au panier.';
        e.hidden = false;
        return;
      }
      errorEl.hidden = true;
      successEl.hidden = true;
      usernameInput.value = '';
      this.refreshCheckoutPreview();
      backdrop.classList.add('show');
    });
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.classList.contains('show')) close();
    });

    usernameInput.addEventListener('input', () => {
      $('checkout-order').textContent = this.orderNote(usernameInput.value.trim());
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = usernameInput.value.trim();
      if (!username) {
        errorEl.textContent = 'Entre ton username Minecraft avant de passer au paiement.';
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      const note = this.orderNote(username);
      navigator.clipboard?.writeText(note)
        .then(() => { successEl.hidden = false; })
        .catch(() => { successEl.hidden = true; });
      void this.api.openExternal(`${PAYPAL_URL}/${this.cartTotal().toFixed(2)}EUR`);
    });
  }

  private refreshCheckoutPreview(): void {
    $('checkout-total-value').textContent = formatPrice(this.cartTotal());
    $('checkout-order').textContent = this.orderNote('');
  }

  private orderNote(username: string): string {
    const lines = this.cart.map((item) =>
      `- ${item.name} x${item.count} (${item.detail}) — ${formatPrice(item.price * item.count)}`,
    );
    return `Username: ${username}\nItems:\n${lines.join('\n')}\nTotal: ${formatPrice(this.cartTotal())}`;
  }
}
