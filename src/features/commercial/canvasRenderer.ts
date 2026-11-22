import { formatMoney, opportunityReasonLabel } from '@/core/config';
import type { Category } from '@/features/catalog/types';
import type { Warehouse } from '@/features/inventory/types';
import { availableSharePercent } from '@/features/marketplace/offer';
import { offerDisplayName, sellerLabel } from '@/features/marketplace/labels';
import type { Offer } from '@/features/marketplace/types';
import {
  COMMERCIAL_SCENES,
  getActiveSubtitleAtTime,
  mapResolvedToCanonicalTime,
  type AspectRatio,
  type CommercialScene,
} from '@/features/commercial/scenes';

export interface RenderFrameParams {
  timeSec: number;
  aspect: AspectRatio;
  width: number;
  height: number;
  offers: Offer[];
  categories: Category[];
  warehouses?: Warehouse[];
  brandImage: HTMLImageElement | null;
  showSubtitles: boolean;
  scenes?: CommercialScene[];
}

const FONT_STACK = "'IBM Plex Sans Arabic', 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif";
const TOUCH_TIMES = [
  18.5, 27.2, 31.8, 35.4, 43.2, 48.6, 57.5, 62.0, 71.8, 76.5, 84.0, 91.8, 99.6, 105.8,
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient
): void {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lineWidth: number
): void {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawClippedRtlText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  align: CanvasTextAlign = 'right'
): void {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  let output = text;
  if (ctx.measureText(output).width > maxWidth) {
    while (output.length > 2 && ctx.measureText(output + '...').width > maxWidth) {
      output = output.slice(0, -1);
    }
    output = output.trimEnd() + '...';
  }
  ctx.fillText(output, x, y);
  ctx.restore();
}

function drawTouchRipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeSec: number,
  S: number
): void {
  for (const tTap of TOUCH_TIMES) {
    const dt = timeSec - tTap;
    if (dt >= 0 && dt <= 0.68) {
      const p = easeOutCubic(dt / 0.68);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, lerp(8 * S, 42 * S, p), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 151, 63, ${0.88 * (1 - p)})`;
      ctx.lineWidth = 3 * S;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, lerp(6 * S, 18 * S, p), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(16, 185, 129, ${0.42 * (1 - p)})`;
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawAtmosphereBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number,
  S: number
): void {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#090e0b');
  bg.addColorStop(0.5, '#122419');
  bg.addColorStop(1, '#080c09');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const sweepX = w * (0.3 + 0.4 * Math.sin(timeSec * 0.2));
  const sweepY = h * (0.28 + 0.16 * Math.cos(timeSec * 0.17));
  const emeraldGlow = ctx.createRadialGradient(sweepX, sweepY, 10 * S, sweepX, sweepY, Math.max(w, h) * 0.55);
  emeraldGlow.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
  emeraldGlow.addColorStop(0.45, 'rgba(31, 61, 43, 0.12)');
  emeraldGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = emeraldGlow;
  ctx.fillRect(0, 0, w, h);

  const goldX = w * (0.72 - 0.25 * Math.sin(timeSec * 0.15));
  const goldY = h * 0.68;
  const goldGlow = ctx.createRadialGradient(goldX, goldY, 10 * S, goldX, goldY, Math.max(w, h) * 0.42);
  goldGlow.addColorStop(0, 'rgba(200, 151, 63, 0.13)');
  goldGlow.addColorStop(0.6, 'rgba(200, 151, 63, 0.03)');
  goldGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = goldGlow;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(239, 234, 223, 0.035)';
  ctx.lineWidth = Math.max(1, 1 * S);
  const step = 96 * S;
  for (let gx = (timeSec * 12 * S) % step; gx < w; gx += step) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let gy = (timeSec * 8 * S) % step; gy < h; gy += step) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPhoneTopHeader(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  pad: number,
  topBarH: number,
  sectionSubtitle: string,
  brandImage: HTMLImageElement | null
): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sw, topBarH);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, topBarH - 1, sw, 1.5);

  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(sw * 0.032)}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText('09:41', pad, sh * 0.034);

  const logoSize = sw * 0.072;
  if (brandImage && brandImage.complete && brandImage.naturalWidth > 0) {
    ctx.drawImage(brandImage, sw - pad - logoSize, topBarH - logoSize - sh * 0.012, logoSize, logoSize);
  } else {
    fillRoundRect(ctx, sw - pad - logoSize, topBarH - logoSize - sh * 0.012, logoSize, logoSize, 8, '#1f3d2b');
  }

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${Math.round(sw * 0.044)}px ${FONT_STACK}`;
  ctx.fillText('حَصّـال', sw - pad - logoSize - sw * 0.025, topBarH - sh * 0.028);

  ctx.fillStyle = '#059669';
  ctx.font = `700 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
  drawClippedRtlText(
    ctx,
    sectionSubtitle,
    sw - pad - logoSize - sw * 0.025,
    topBarH - sh * 0.008,
    sw * 0.62
  );
  ctx.restore();
}

function drawPhoneBottomNav(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  activeTab: 'market' | 'maps' | 'demands' | 'deals'
): void {
  const navH = sh * 0.072;
  const navY = sh - navH;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, navY, sw, navH);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, navY, sw, 1.5);

  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'market', label: 'السوق' },
    { id: 'maps', label: 'الخريطة' },
    { id: 'demands', label: 'الاحتياج' },
    { id: 'deals', label: 'الصفقات' },
  ];

  const colW = sw / tabs.length;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  for (let i = 0; i < tabs.length; i += 1) {
    const t = tabs[i];
    const cx = sw - (i + 0.5) * colW;
    const isActive = t.id === activeTab;
    if (isActive) {
      fillRoundRect(ctx, cx - colW * 0.36, navY + navH * 0.14, colW * 0.72, navH * 0.72, 10, '#ecfdf5');
    }
    ctx.fillStyle = isActive ? '#059669' : '#64748b';
    ctx.font = `${isActive ? '800' : '600'} ${Math.round(sw * 0.026)}px ${FONT_STACK}`;
    ctx.fillText(t.label, cx, navY + navH * 0.58);
  }
  ctx.restore();
}

/**
 * Draws the real HASSAL customer UI inside the smartphone viewport across Scenes 3..9.
 */
function drawCustomerAppScreen(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  timeSec: number,
  offers: Offer[],
  categories: Category[],
  warehouses: Warehouse[],
  brandImage: HTMLImageElement | null
): void {
  const pad = sw * 0.055;
  const innerW = sw - pad * 2;
  const topBarH = sh * 0.105;
  const bottomNavH = sh * 0.072;
  const primaryOffer = offers[0];
  const secondaryOffer = offers[1] ?? offers[0];

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, sw, sh);

  // Scene 3 Launch Splash (14.0 - 16.5s)
  if (timeSec < 16.6) {
    const fadeOut = timeSec > 15.6 ? 1 - easeOutCubic((timeSec - 15.6) / 1.0) : 1;
    if (timeSec < 15.7) {
      fillRoundRect(ctx, 0, 0, sw, sh, 0, '#ffffff');
      const centerLogo = sw * 0.34;
      if (brandImage && brandImage.complete && brandImage.naturalWidth > 0) {
        ctx.drawImage(brandImage, (sw - centerLogo) / 2, sh * 0.34, centerLogo, centerLogo);
      }
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${Math.round(sw * 0.088)}px ${FONT_STACK}`;
      ctx.fillText('حَصّـال', sw / 2, sh * 0.56);
      ctx.fillStyle = '#0f766e';
      ctx.font = `700 ${Math.round(sw * 0.036)}px ${FONT_STACK}`;
      ctx.fillText('HASSAL B2B', sw / 2, sh * 0.61);
      ctx.fillStyle = '#a9761c';
      ctx.font = `700 ${Math.round(sw * 0.045)}px ${FONT_STACK}`;
      ctx.fillText('خدماتك أقرب', sw / 2, sh * 0.67);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = 1 - fadeOut;
    ctx.restore();
  }

  // Determine which REAL HASSAL customer screen is open:
  // 14-54s & 82-97s: Marketplace (with GeoSearch in 33-40s, Q&A Thread in 45-54s, OrderRequestSheet in 83-97s)
  // 54-68s: Warehouse Logistics Map ("خريطة المستودعات واللوجستيات")
  // 68-82s: Demands & Quotations ("لوحة طلبات الاحتياج وطاولة عروض الأسعار")
  // 97-111s: Deals & Purchase Requests + Handover Code ("الصفقات وطلبات الشراء")
  if (timeSec >= 54.0 && timeSec < 68.0) {
    drawPhoneTopHeader(ctx, sw, sh, pad, topBarH, 'خريطة المستودعات واللوجستيات', brandImage);
    drawWarehouseMapScreen(ctx, sw, sh, topBarH, sh - topBarH - bottomNavH, pad, innerW, timeSec, warehouses);
    drawPhoneBottomNav(ctx, sw, sh, 'maps');
    return;
  }

  if (timeSec >= 68.0 && timeSec < 82.0) {
    drawPhoneTopHeader(ctx, sw, sh, pad, topBarH, 'لوحة طلبات الاحتياج وعروض الأسعار', brandImage);
    drawDemandsScreen(ctx, sw, sh, topBarH, sh - topBarH - bottomNavH, pad, innerW, timeSec);
    drawPhoneBottomNav(ctx, sw, sh, 'demands');
    return;
  }

  if (timeSec >= 97.0 && timeSec < 111.0) {
    drawPhoneTopHeader(ctx, sw, sh, pad, topBarH, 'الصفقات وطلبات الشراء', brandImage);
    drawBuyerTrackingScreen(ctx, sw, sh, topBarH, pad, innerW, timeSec, primaryOffer);
    drawPhoneBottomNav(ctx, sw, sh, 'deals');
    return;
  }

  // Marketplace Customer Screens (Scenes 3, 4, 5, 8, and Scene 10 home preview)
  drawPhoneTopHeader(ctx, sw, sh, pad, topBarH, 'سوق الفرص والمخزون', brandImage);

  let scrollY = 0;
  if (timeSec >= 25.0 && timeSec < 40.0) {
    scrollY = easeInOutCubic((timeSec - 28.0) / 10.0) * sh * 0.21;
  } else if (timeSec >= 40.0 && timeSec < 54.0) {
    scrollY = sh * 0.25 + easeInOutCubic(clamp01((timeSec - 43.0) / 5.0)) * sh * 0.14;
  } else if (timeSec >= 82.0 && timeSec < 97.0) {
    scrollY = sh * 0.24;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topBarH, sw, sh - topBarH - bottomNavH);
  ctx.clip();

  let cursorY = topBarH + sh * 0.016 - scrollY;

  // Customer Verified Org chip strip in Scene 3 (16.5 - 25s)
  if (timeSec < 25.0) {
    const ctxH = sh * 0.052;
    fillRoundRect(ctx, pad, cursorY, innerW, ctxH, 10, '#ecfdf5');
    strokeRoundRect(ctx, pad, cursorY, innerW, ctxH, 10, '#a7f3d0', 1.2);
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#065f46';
    ctx.font = `700 ${Math.round(sw * 0.026)}px ${FONT_STACK}`;
    drawClippedRtlText(
      ctx,
      'حساب المنشأة النشطة • تصفح وإرسال طلبات الشراء مباشرة',
      sw - pad * 1.35,
      cursorY + ctxH * 0.62,
      innerW * 0.88
    );
    ctx.restore();
    cursorY += ctxH + sh * 0.014;
  }

  // 1. Search Bar
  const searchH = sh * 0.058;
  fillRoundRect(ctx, pad, cursorY, innerW, searchH, 12, '#ffffff');
  strokeRoundRect(ctx, pad, cursorY, innerW, searchH, 12, timeSec >= 27.0 && timeSec < 31.0 ? '#059669' : '#cbd5e1', 1.5);
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  const typedHighlight = timeSec >= 27.0 && timeSec <= 32.0;
  ctx.fillStyle = typedHighlight ? '#065f46' : '#64748b';
  ctx.font = `${typedHighlight ? '700' : '500'} ${Math.round(sw * 0.03)}px ${FONT_STACK}`;
  drawClippedRtlText(
    ctx,
    typedHighlight ? 'أرز بسمتي — متاح الآن' : 'بحث باسم الصنف أو الكود أو البائع...',
    sw - pad * 1.4,
    cursorY + searchH * 0.62,
    innerW * 0.82
  );
  ctx.restore();
  cursorY += searchH + sh * 0.014;

  // 2. Marketplace Hero Banner
  const heroH = sh * 0.155;
  const heroGrad = ctx.createLinearGradient(pad, cursorY, pad + innerW, cursorY + heroH);
  heroGrad.addColorStop(0, '#064e3b');
  heroGrad.addColorStop(0.55, '#065f46');
  heroGrad.addColorStop(1, '#0f172a');
  fillRoundRect(ctx, pad, cursorY, innerW, heroH, 16, heroGrad);

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6ee7b7';
  ctx.font = `700 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
  drawClippedRtlText(ctx, 'عروض مخزونات نشطة من مؤسسات على المنصة', sw - pad * 1.4, cursorY + heroH * 0.25, innerW * 0.88);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.round(sw * 0.038)}px ${FONT_STACK}`;
  drawClippedRtlText(ctx, 'ابحث في العروض المتاحة، ثم أرسل', sw - pad * 1.4, cursorY + heroH * 0.5, innerW * 0.88);
  drawClippedRtlText(ctx, 'طلب شراء إلى البائع', sw - pad * 1.4, cursorY + heroH * 0.69, innerW * 0.88);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 ${Math.round(sw * 0.023)}px ${FONT_STACK}`;
  drawClippedRtlText(ctx, 'الكمية تُحجز عند قبول البائع لطلبك بكل وضوح', sw - pad * 1.4, cursorY + heroH * 0.88, innerW * 0.88);
  ctx.restore();
  cursorY += heroH + sh * 0.014;

  // 3. CategoryPillRow + GeoSearchPanel toggle (in Scene 4: 33-40s Geo Search expands!)
  const catNames = ['الكل', ...categories.slice(0, 3).map((c) => c.name_ar)];
  if (catNames.length === 1) catNames.push('أرز وحبوب', 'زيوت وسمن', 'معلبات');
  const activeCatIdx = timeSec >= 31.8 && timeSec < 35.0 ? 1 : 0;
  const pillH = sh * 0.044;
  let pillRightX = sw - pad;
  for (let i = 0; i < catNames.length; i += 1) {
    const label = catNames[i];
    ctx.font = `700 ${Math.round(sw * 0.027)}px ${FONT_STACK}`;
    const pillW = Math.min(innerW * 0.36, ctx.measureText(label).width + sw * 0.06);
    const px = pillRightX - pillW;
    if (px < pad) break;
    const selected = i === activeCatIdx;
    fillRoundRect(ctx, px, cursorY, pillW, pillH, 999, selected ? '#059669' : '#ffffff');
    strokeRoundRect(ctx, px, cursorY, pillW, pillH, 999, selected ? '#059669' : '#cbd5e1', 1.2);
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = selected ? '#ffffff' : '#334155';
    ctx.fillText(label, px + pillW / 2, cursorY + pillH * 0.65);
    ctx.restore();
    pillRightX = px - sw * 0.02;
  }
  cursorY += pillH + sh * 0.014;

  // GeoSearchPanel active view during 34.5s - 40.0s
  if (timeSec >= 34.5 && timeSec < 40.0) {
    const geoH = sh * 0.145;
    fillRoundRect(ctx, pad, cursorY, innerW, geoH, 12, '#ecfdf5');
    strokeRoundRect(ctx, pad, cursorY, innerW, geoH, 12, '#10b981', 1.6);
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#065f46';
    ctx.font = `800 ${Math.round(sw * 0.029)}px ${FONT_STACK}`;
    ctx.fillText('📍 مفعل: الأقرب جغرافياً (نطاق 25 كم)', sw - pad * 1.35, cursorY + geoH * 0.32);
    ctx.fillStyle = '#047857';
    ctx.font = `600 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
    ctx.fillText('تمت قراءة موقعك الحالي • عرض العروض الأقرب لمستودعك', sw - pad * 1.35, cursorY + geoH * 0.62);
    fillRoundRect(ctx, pad * 1.35, cursorY + geoH * 0.72, innerW * 0.56, geoH * 0.2, 8, '#059669');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(sw * 0.022)}px ${FONT_STACK}`;
    ctx.fillText('استخدم موقعي من المتصفح ✓', pad * 1.35 + innerW * 0.28, cursorY + geoH * 0.855);
    ctx.restore();
    cursorY += geoH + sh * 0.016;
  }

  // 4. Real OfferCard List
  const displayOffers = [primaryOffer, secondaryOffer].filter(Boolean) as Offer[];
  const cardsToDraw = displayOffers.length > 0 ? displayOffers : [null];
  const cardH = sh * 0.305;

  for (let idx = 0; idx < cardsToDraw.length; idx += 1) {
    const offer = cardsToDraw[idx];
    const cardTop = cursorY + idx * (cardH + sh * 0.018);

    const isFocused = idx === 0 && ((timeSec >= 40.0 && timeSec < 54.0) || (timeSec >= 82.0 && timeSec < 97.0));
    fillRoundRect(ctx, pad, cardTop, innerW, cardH, 14, '#ffffff');
    strokeRoundRect(ctx, pad, cardTop, innerW, cardH, 14, isFocused ? '#059669' : '#e2e8f0', isFocused ? 2.4 : 1.4);

    const mediaH = cardH * 0.34;
    const mediaGrad = ctx.createLinearGradient(pad, cardTop, pad + innerW, cardTop + mediaH);
    mediaGrad.addColorStop(0, idx === 0 ? '#1f3d2b' : '#1e293b');
    mediaGrad.addColorStop(1, idx === 0 ? '#065f46' : '#0f766e');
    fillRoundRect(ctx, pad, cardTop, innerW, mediaH, 14, mediaGrad);
    ctx.fillRect(pad, cardTop + mediaH - 14, innerW, 14);

    const title = offer ? offerDisplayName(offer, 'ar') : 'أرز بسمتي هندي درجة أولى — 40 كجم';
    const warehouse = offer
      ? [offer.warehouse_city, offer.warehouse_name].filter(Boolean).join(' — ') || 'مستودع عدن المركزي'
      : 'عدن — مستودع المنصورة المركزي';
    const reasonText = offer ? opportunityReasonLabel(offer.opportunity_reason, 'ar') : 'فائض مخزون موسمي';
    const sellerText = offer ? sellerLabel(offer, 'ar').text : 'شركة النخيل للتجارة الغذائية';
    const availableStr = offer ? `${offer.available_quantity} ${offer.unit}` : '450 كيس';
    const moqStr = offer ? `${offer.min_order_quantity}` : '20';
    const pct = offer ? availableSharePercent(offer) : 78;
    const priceStr = offer ? formatMoney(offer.unit_price, offer.currency_code) : '42,500 ر.ي';

    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    fillRoundRect(ctx, sw - pad - sw * 0.36, cardTop + mediaH * 0.16, sw * 0.32, mediaH * 0.28, 6, '#ecfdf5');
    ctx.fillStyle = '#065f46';
    ctx.font = `700 ${Math.round(sw * 0.022)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, reasonText, sw - pad - sw * 0.06, cardTop + mediaH * 0.36, sw * 0.28);

    ctx.fillStyle = '#f8fafc';
    ctx.font = `600 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, warehouse, sw - pad * 1.35, cardTop + mediaH * 0.82, innerW * 0.85);

    ctx.fillStyle = '#0f172a';
    ctx.font = `800 ${Math.round(sw * 0.033)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, title, sw - pad * 1.35, cardTop + mediaH + cardH * 0.12, innerW * 0.88);

    ctx.fillStyle = '#475569';
    ctx.font = `600 ${Math.round(sw * 0.025)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, `✓ ${sellerText}`, sw - pad * 1.35, cardTop + mediaH + cardH * 0.24, innerW * 0.88);

    ctx.fillStyle = '#64748b';
    ctx.font = `500 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
    ctx.fillText('المخزون المتاح حالياً:', sw - pad * 1.35, cardTop + mediaH + cardH * 0.36);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
    ctx.fillText(availableStr, pad * 1.35, cardTop + mediaH + cardH * 0.36);

    const barY = cardTop + mediaH + cardH * 0.41;
    fillRoundRect(ctx, pad * 1.35, barY, innerW - pad * 0.7, 6, 4, '#e2e8f0');
    fillRoundRect(
      ctx,
      pad * 1.35 + (innerW - pad * 0.7) * (1 - clamp01(pct / 100)),
      barY,
      (innerW - pad * 0.7) * clamp01(pct / 100),
      6,
      4,
      '#059669'
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 ${Math.round(sw * 0.021)}px ${FONT_STACK}`;
    ctx.fillText(`سعر الوحدة • الحد الأدنى ${moqStr}`, sw - pad * 1.35, cardTop + cardH * 0.83);

    ctx.fillStyle = '#047857';
    ctx.font = `800 ${Math.round(sw * 0.036)}px ${FONT_STACK}`;
    ctx.fillText(priceStr, sw - pad * 1.35, cardTop + cardH * 0.94);

    const btnW = innerW * 0.42;
    const btnH = cardH * 0.145;
    fillRoundRect(ctx, pad * 1.3, cardTop + cardH * 0.8, btnW, btnH, 8, '#059669');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(sw * 0.025)}px ${FONT_STACK}`;
    ctx.fillText('طلب شراء من المتاح', pad * 1.3 + btnW / 2, cardTop + cardH * 0.89);

    ctx.restore();

    // Community Interest & Q&A Thread drawer below primary card during Scene 5 (45.0s - 54.0s)
    if (idx === 0 && timeSec >= 45.0 && timeSec < 54.0) {
      const qaTop = cardTop + cardH + sh * 0.012;
      const qaH = sh * 0.24;
      fillRoundRect(ctx, pad, qaTop, innerW, qaH, 12, '#f8fafc');
      strokeRoundRect(ctx, pad, qaTop, innerW, qaH, 12, '#cbd5e1', 1.4);

      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${Math.round(sw * 0.027)}px ${FONT_STACK}`;
      ctx.fillText('أسئلة منشورة على هذا العرض • ♥ 18 مهتماً', sw - pad * 1.35, qaTop + qaH * 0.18);

      // Customer question bubble
      fillRoundRect(ctx, pad * 1.3, qaTop + qaH * 0.26, innerW - pad * 0.6, qaH * 0.28, 8, '#ffffff');
      ctx.fillStyle = '#334155';
      ctx.font = `600 ${Math.round(sw * 0.023)}px ${FONT_STACK}`;
      drawClippedRtlText(ctx, 'سؤال المشتري: هل يتوفر تاريخ الإنتاج وتفاصيل التعبئة للكمية؟', sw - pad * 1.45, qaTop + qaH * 0.43, innerW * 0.84);

      // Verified Seller answer bubble ("من البائع")
      fillRoundRect(ctx, pad * 1.3, qaTop + qaH * 0.59, innerW - pad * 0.6, qaH * 0.3, 8, '#ecfdf5');
      ctx.fillStyle = '#065f46';
      ctx.font = `700 ${Math.round(sw * 0.023)}px ${FONT_STACK}`;
      drawClippedRtlText(ctx, 'من البائع ✓: نعم، الإنتاج حديث ومطابق للمواصفات والتسليم فوري.', sw - pad * 1.45, qaTop + qaH * 0.77, innerW * 0.84);
      ctx.restore();
    }
  }

  ctx.restore();

  // Bottom bar under scroll area
  drawPhoneBottomNav(ctx, sw, sh, 'market');

  // Touch ripples inside marketplace
  if (timeSec >= 27.2 && timeSec <= 28.0) {
    drawTouchRipple(ctx, sw * 0.65, topBarH + sh * 0.045, timeSec, sw / 390);
  } else if (timeSec >= 35.4 && timeSec <= 36.2) {
    drawTouchRipple(ctx, sw * 0.52, topBarH + sh * 0.34, timeSec, sw / 390);
  } else if (timeSec >= 48.6 && timeSec <= 49.4) {
    drawTouchRipple(ctx, sw * 0.62, topBarH + sh * 0.56, timeSec, sw / 390);
  } else if (timeSec >= 84.0 && timeSec <= 84.8) {
    drawTouchRipple(ctx, sw * 0.28, topBarH + sh * 0.42, timeSec, sw / 390);
  }

  // Real OrderRequestSheet Drawer overlay in Scene 8 (84.2s - 97.0s)
  if (timeSec >= 84.2 && timeSec < 97.0) {
    const enter = easeOutCubic((timeSec - 84.2) / 0.6);
    ctx.save();
    ctx.fillStyle = `rgba(15, 23, 42, ${0.55 * enter})`;
    ctx.fillRect(0, 0, sw, sh);

    const sheetH = sh * 0.68;
    const sheetY = sh - sheetH * enter;
    fillRoundRect(ctx, 0, sheetY, sw, sheetH + 20, 22, '#ffffff');

    const sPad = pad;
    const pTitle = primaryOffer ? offerDisplayName(primaryOffer, 'ar') : 'أرز بسمتي هندي درجة أولى';
    const pUnit = primaryOffer?.unit ?? 'كيس';
    const pPrice = primaryOffer ? formatMoney(primaryOffer.unit_price, primaryOffer.currency_code) : '42,500 ر.ي';
    const pQty = timeSec >= 89.2 ? 60 : 40;

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    fillRoundRect(ctx, sw / 2 - sw * 0.09, sheetY + sh * 0.015, sw * 0.18, 4, 2, '#cbd5e1');

    ctx.fillStyle = '#047857';
    ctx.font = `700 ${Math.round(sw * 0.025)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, 'البائع يراجع الطلب، والحجز يحدث عندها لا هنا', sw - sPad, sheetY + sh * 0.068, innerW);

    ctx.fillStyle = '#0f172a';
    ctx.font = `800 ${Math.round(sw * 0.04)}px ${FONT_STACK}`;
    ctx.fillText('طلب شراء على مخزون العرض', sw - sPad, sheetY + sh * 0.11);

    fillRoundRect(ctx, sPad, sheetY + sh * 0.14, innerW, sh * 0.125, 12, '#f8fafc');
    strokeRoundRect(ctx, sPad, sheetY + sh * 0.14, innerW, sh * 0.125, 12, '#e2e8f0', 1.2);
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(sw * 0.031)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, pTitle, sw - sPad * 1.4, sheetY + sh * 0.19, innerW * 0.9);
    ctx.fillStyle = '#047857';
    ctx.font = `700 ${Math.round(sw * 0.028)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, `سعر الوحدة: ${pPrice} / ${pUnit}`, sw - sPad * 1.4, sheetY + sh * 0.24, innerW * 0.9);

    ctx.fillStyle = '#334155';
    ctx.font = `700 ${Math.round(sw * 0.029)}px ${FONT_STACK}`;
    ctx.fillText(`الكمية المطلوبة (${pUnit}):`, sw - sPad, sheetY + sh * 0.32);

    const qtyBoxY = sheetY + sh * 0.345;
    const qtyBoxH = sh * 0.072;
    fillRoundRect(ctx, sPad, qtyBoxY, innerW, qtyBoxH, 10, '#f1f5f9');
    strokeRoundRect(ctx, sPad, qtyBoxY, innerW, qtyBoxH, 10, '#cbd5e1', 1.2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 ${Math.round(sw * 0.044)}px ${FONT_STACK}`;
    ctx.fillText(`${pQty}`, sw / 2, qtyBoxY + qtyBoxH * 0.65);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = `700 ${Math.round(sw * 0.029)}px ${FONT_STACK}`;
    ctx.fillText('آلية الاستلام والتسليم:', sw - sPad, sheetY + sh * 0.468);
    fillRoundRect(ctx, sPad, sheetY + sh * 0.49, innerW, sh * 0.06, 10, '#ecfdf5');
    strokeRoundRect(ctx, sPad, sheetY + sh * 0.49, innerW, sh * 0.06, 10, '#059669', 1.5);
    ctx.fillStyle = '#065f46';
    ctx.font = `700 ${Math.round(sw * 0.027)}px ${FONT_STACK}`;
    ctx.fillText('✓ توصيل من مستودع البائع / استلام مباشر', sw - sPad * 1.35, sheetY + sh * 0.53);

    const submitY = sheetY + sh * 0.585;
    const submitH = sh * 0.072;
    const submitted = timeSec >= 92.0;
    fillRoundRect(ctx, sPad, submitY, innerW, submitH, 12, submitted ? '#065f46' : '#059669');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(sw * 0.033)}px ${FONT_STACK}`;
    ctx.fillText(
      submitted ? '✓ تم تسجيل طلب الشراء لدى البائع للمراجعة' : 'إرسال طلب الشراء للبائع',
      sw / 2,
      submitY + submitH * 0.63
    );

    if (timeSec >= 91.8 && timeSec <= 92.6) {
      drawTouchRipple(ctx, sw / 2, submitY + submitH / 2, timeSec, sw / 390);
    }

    ctx.restore();
  }
}

/**
 * Scene 6 (54 - 68s): Warehouse Logistics Map ("خريطة المستودعات واللوجستيات")
 */
function drawWarehouseMapScreen(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  topBarH: number,
  bodyH: number,
  pad: number,
  innerW: number,
  timeSec: number,
  warehouses: Warehouse[]
): void {
  const localP = clamp01((timeSec - 54.0) / 14.0);
  const focusIdx = localP > 0.48 ? 1 : 0;

  const list =
    warehouses.length > 0
      ? warehouses.slice(0, 3)
      : [
          {
            id: 1,
            organization_id: 1,
            name: 'مستودع المنصورة المركزي',
            city: 'عدن',
            district: 'المنصورة — المنطقة الصناعية',
            address_line: 'عدن',
            latitude: 12.8456,
            longitude: 45.0089,
          },
          {
            id: 2,
            organization_id: 2,
            name: 'مركز توزيع السبعين اللوجستي',
            city: 'صنعاء',
            district: 'السبعين',
            address_line: 'صنعاء',
            latitude: 15.3321,
            longitude: 44.2065,
          },
        ];

  ctx.save();
  let y = topBarH + sh * 0.022;

  // Map Canvas Window
  const mapH = bodyH * 0.48;
  fillRoundRect(ctx, pad, y, innerW, mapH, 16, '#dbeafe');
  strokeRoundRect(ctx, pad, y, innerW, mapH, 16, '#93c5fd', 1.4);

  // Stylized topographic map grid + roads
  ctx.save();
  roundedRectPath(ctx, pad, y, innerW, mapH, 16);
  ctx.clip();

  fillRoundRect(ctx, pad, y, innerW, mapH, 0, '#e8f1ec');
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(pad, y + (mapH / 6) * i);
    ctx.lineTo(pad + innerW, y + (mapH / 6) * i);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pad + (innerW / 5) * i, y);
    ctx.lineTo(pad + (innerW / 5) * i, y + mapH);
    ctx.stroke();
  }

  // Logistics highway curve
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pad, y + mapH * 0.72);
  ctx.bezierCurveTo(pad + innerW * 0.35, y + mapH * 0.25, pad + innerW * 0.65, y + mapH * 0.85, pad + innerW, y + mapH * 0.3);
  ctx.stroke();

  // Map Pins
  const pins = [
    { x: pad + innerW * 0.34, y: y + mapH * 0.42 },
    { x: pad + innerW * 0.68, y: y + mapH * 0.58 },
    { x: pad + innerW * 0.52, y: y + mapH * 0.28 },
  ];
  for (let i = 0; i < Math.min(list.length, pins.length); i += 1) {
    const p = pins[i];
    const active = i === focusIdx;
    if (active) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20 + Math.sin(timeSec * 5) * 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(5, 150, 105, 0.22)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, active ? 11 : 8, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#059669' : '#475569';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();

  y += mapH + sh * 0.022;

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${Math.round(sw * 0.032)}px ${FONT_STACK}`;
  ctx.fillText(`المستودعات ومراكز التوزيع (${list.length})`, sw - pad, y + sh * 0.02);
  y += sh * 0.04;

  // Warehouse site rows
  const rowH = sh * 0.11;
  for (let i = 0; i < Math.min(2, list.length); i += 1) {
    const wh = list[i];
    const selected = i === focusIdx;
    fillRoundRect(ctx, pad, y, innerW, rowH, 12, selected ? '#ecfdf5' : '#ffffff');
    strokeRoundRect(ctx, pad, y, innerW, rowH, 12, selected ? '#059669' : '#e2e8f0', selected ? 1.8 : 1.2);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 ${Math.round(sw * 0.029)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, `📍 ${wh.name}`, sw - pad * 1.35, y + rowH * 0.38, innerW * 0.88);

    ctx.fillStyle = '#475569';
    ctx.font = `500 ${Math.round(sw * 0.023)}px ${FONT_STACK}`;
    drawClippedRtlText(
      ctx,
      `${wh.city}، ${wh.district || wh.address_line || ''}`,
      sw - pad * 1.35,
      y + rowH * 0.67,
      innerW * 0.88
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = '#047857';
    ctx.font = `700 ${Math.round(sw * 0.02)}px ${FONT_STACK}`;
    ctx.fillText(
      `${Number(wh.latitude ?? 12.84).toFixed(4)}, ${Number(wh.longitude ?? 45.01).toFixed(4)}`,
      pad * 1.35,
      y + rowH * 0.88
    );

    y += rowH + sh * 0.015;
  }

  if (timeSec >= 62.0 && timeSec <= 62.7) {
    drawTouchRipple(ctx, sw * 0.55, topBarH + mapH + sh * 0.21, timeSec, sw / 390);
  }
  ctx.restore();
}

/**
 * Scene 7 (68 - 82s): Demand Board & Quotation Desk ("لوحة طلبات الاحتياج وطاولة عروض الأسعار")
 */
function drawDemandsScreen(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  topBarH: number,
  _bodyH: number,
  pad: number,
  innerW: number,
  timeSec: number
): void {
  const localP = clamp01((timeSec - 68.0) / 14.0);
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';

  let y = topBarH + sh * 0.024;

  // Header & New Demand CTA
  fillRoundRect(ctx, pad, y, innerW, sh * 0.105, 14, '#ffffff');
  strokeRoundRect(ctx, pad, y, innerW, sh * 0.105, 14, '#e2e8f0', 1.4);
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${Math.round(sw * 0.032)}px ${FONT_STACK}`;
  ctx.fillText('لوحة طلبات الاحتياج (RFQ)', sw - pad * 1.35, y + sh * 0.042);
  ctx.fillStyle = '#64748b';
  ctx.font = `500 ${Math.round(sw * 0.022)}px ${FONT_STACK}`;
  drawClippedRtlText(ctx, 'المطابقة تُرشح عروضاً، والبائع يقدّم عرض سعر واضح', sw - pad * 1.35, y + sh * 0.08, innerW * 0.88);
  y += sh * 0.122;

  // Customer RFQ Card
  const rfqH = sh * 0.23;
  fillRoundRect(ctx, pad, y, innerW, rfqH, 14, '#ffffff');
  strokeRoundRect(ctx, pad, y, innerW, rfqH, 14, '#10b981', 1.8);

  fillRoundRect(ctx, sw - pad - sw * 0.28, y + sh * 0.02, sw * 0.24, sh * 0.032, 6, '#ecfdf5');
  ctx.fillStyle = '#065f46';
  ctx.font = `700 ${Math.round(sw * 0.022)}px ${FONT_STACK}`;
  ctx.fillText('طلب احتياج مفتوح', sw - pad * 1.45, y + sh * 0.042);

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${Math.round(sw * 0.033)}px ${FONT_STACK}`;
  drawClippedRtlText(ctx, 'مطلوب: زيت نباتي نقي — 150 كرتون', sw - pad * 1.35, y + sh * 0.095, innerW * 0.88);

  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(sw * 0.025)}px ${FONT_STACK}`;
  ctx.fillText('الكمية المستهدفة: 150 كرتون • مدينة التسليم: عدن', sw - pad * 1.35, y + sh * 0.145);

  ctx.fillStyle = '#047857';
  ctx.font = `700 ${Math.round(sw * 0.025)}px ${FONT_STACK}`;
  ctx.fillText('✓ تم رصد 3 ترشيحات مطابقة من عروض السوق', sw - pad * 1.35, y + sh * 0.195);
  y += rfqH + sh * 0.022;

  // Incoming Quotation Card revealing smoothly
  const quoteAlpha = easeOutCubic(clamp01((localP - 0.35) / 0.25));
  ctx.save();
  ctx.globalAlpha = quoteAlpha;
  const quoteH = sh * 0.25;
  fillRoundRect(ctx, pad, y, innerW, quoteH, 14, '#ecfdf5');
  strokeRoundRect(ctx, pad, y, innerW, quoteH, 14, '#059669', 1.8);

  ctx.fillStyle = '#065f46';
  ctx.font = `800 ${Math.round(sw * 0.03)}px ${FONT_STACK}`;
  ctx.fillText('عرض سعر وارد من المورد #Q-409', sw - pad * 1.35, y + sh * 0.048);

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(sw * 0.028)}px ${FONT_STACK}`;
  ctx.fillText('الكمية المعروضة: 150 كرتون • التسليم الفوري', sw - pad * 1.35, y + sh * 0.1);

  ctx.fillStyle = '#047857';
  ctx.font = `800 ${Math.round(sw * 0.035)}px ${FONT_STACK}`;
  ctx.fillText('سعر الوحدة المقترح: 28,000 ر.ي', sw - pad * 1.35, y + sh * 0.155);

  fillRoundRect(ctx, pad * 1.35, y + sh * 0.18, innerW - pad * 0.7, sh * 0.048, 10, '#059669');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(sw * 0.026)}px ${FONT_STACK}`;
  ctx.fillText('الانتقال إلى المطابقة ورفع طلب شراء', sw / 2, y + sh * 0.212);
  ctx.restore();

  if (timeSec >= 76.5 && timeSec <= 77.2) {
    drawTouchRipple(ctx, sw / 2, y + sh * 0.2, timeSec, sw / 390);
  }
  ctx.restore();
}

/**
 * Scene 9 (97 - 111s): Deals Pipeline & Handover Gate Code Verification ("الصفقات وطلبات الشراء")
 */
function drawBuyerTrackingScreen(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  topBarH: number,
  pad: number,
  innerW: number,
  timeSec: number,
  primaryOffer?: Offer
): void {
  const localP = clamp01((timeSec - 97.0) / 14.0);
  const title = primaryOffer ? offerDisplayName(primaryOffer, 'ar') : 'أرز بسمتي هندي درجة أولى';

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';

  let y = topBarH + sh * 0.024;

  // Tabs ("الصفقات" / "طلبات الشراء" / "الحجوزات النشطة")
  const tabs = ['طلبات الشراء', 'الحجوزات النشطة', 'الصفقات'];
  const tabW = innerW / 3;
  const tabH = sh * 0.05;
  fillRoundRect(ctx, pad, y, innerW, tabH, 10, '#e2e8f0');
  for (let i = 0; i < tabs.length; i += 1) {
    const active = (localP < 0.28 && i === 0) || (localP >= 0.28 && localP < 0.55 && i === 1) || (localP >= 0.55 && i === 2);
    const tx = sw - pad - (i + 1) * tabW + 3;
    if (active) {
      fillRoundRect(ctx, tx, y + 3, tabW - 6, tabH - 6, 8, '#ffffff');
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = active ? '#065f46' : '#475569';
    ctx.font = `700 ${Math.round(sw * 0.026)}px ${FONT_STACK}`;
    ctx.fillText(tabs[i], tx + (tabW - 6) / 2, y + tabH * 0.63);
  }
  y += tabH + sh * 0.02;

  // Deal & Purchase Request Progress Card
  const cardH = sh * 0.64;
  fillRoundRect(ctx, pad, y, innerW, cardH, 16, '#ffffff');
  strokeRoundRect(ctx, pad, y, innerW, cardH, 16, '#10b981', 1.8);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#059669';
  ctx.font = `700 ${Math.round(sw * 0.026)}px ${FONT_STACK}`;
  ctx.fillText('صفقة #DL-2026-108 • متابعة العميل', sw - pad * 1.4, y + sh * 0.04);

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${Math.round(sw * 0.034)}px ${FONT_STACK}`;
  drawClippedRtlText(ctx, title, sw - pad * 1.4, y + sh * 0.082, innerW * 0.88);

  const stages: Array<{ title: string; sub: string; threshold: number }> = [
    {
      title: 'بانتظار قرار البائع — لا حجز بعد',
      sub: 'تم تسجيل طلب الشراء وإرساله للبائع',
      threshold: 0.0,
    },
    {
      title: 'مقبول: الكمية محجوزة',
      sub: 'تم اعتماد الطلب وحجز الكمية من المخزون المتاح',
      threshold: 0.25,
    },
    {
      title: 'قيد التجهيز وجاهزة للاستلام',
      sub: 'تم إصدار أمر الشراء وتجهيز الشحنة بالمستودع',
      threshold: 0.5,
    },
    {
      title: 'تأكيد كود التسليم عند البوابة ✓',
      sub: 'تم التحقق وإغلاق الصفقة: استُلمت وأُغلقت',
      threshold: 0.72,
    },
  ];

  let stepY = y + sh * 0.132;
  for (let i = 0; i < stages.length; i += 1) {
    const st = stages[i];
    const done = localP >= st.threshold;
    const isCurrent = done && (i === stages.length - 1 || localP < stages[i + 1].threshold);

    if (i < stages.length - 1) {
      ctx.fillStyle = localP >= stages[i + 1].threshold ? '#059669' : '#cbd5e1';
      ctx.fillRect(sw - pad * 1.65 - 1.5, stepY + 14, 3, sh * 0.082);
    }

    ctx.beginPath();
    ctx.arc(sw - pad * 1.65, stepY + 6, isCurrent ? 10 : 8, 0, Math.PI * 2);
    ctx.fillStyle = done ? '#059669' : '#cbd5e1';
    ctx.fill();

    ctx.fillStyle = done ? '#065f46' : '#64748b';
    ctx.font = `800 ${Math.round(sw * 0.029)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, st.title, sw - pad * 2.2, stepY + 10, innerW * 0.76);

    ctx.fillStyle = done ? '#334155' : '#94a3b8';
    ctx.font = `500 ${Math.round(sw * 0.022)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, st.sub, sw - pad * 2.2, stepY + sh * 0.034, innerW * 0.76);

    stepY += sh * 0.09;
  }

  // Handover Delivery Code verification badge when Stage 4 activates (105.5s+)
  if (localP >= 0.65) {
    const badgeY = y + sh * 0.51;
    fillRoundRect(ctx, pad * 1.35, badgeY, innerW - pad * 0.7, sh * 0.095, 12, '#064e3b');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = `700 ${Math.round(sw * 0.024)}px ${FONT_STACK}`;
    ctx.fillText('كود التسليم عند البوابة — موثّق', sw / 2, badgeY + sh * 0.038);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(sw * 0.032)}px ${FONT_STACK}`;
    ctx.fillText(localP >= 0.78 ? '✓ HSL-9042-GATE — تم الاستلام والإغلاق' : 'HSL-9042-GATE', sw / 2, badgeY + sh * 0.075);
  }

  ctx.restore();
  drawPhoneBottomNav(ctx, sw, sh, 'deals');

  if (timeSec >= 105.8 && timeSec <= 106.5) {
    drawTouchRipple(ctx, sw / 2, topBarH + sh * 0.65, timeSec, sw / 390);
  }
}

function drawSmartphoneDevice(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  phoneW: number,
  phoneH: number,
  rotationRad: number,
  scale: number,
  timeSec: number,
  offers: Offer[],
  categories: Category[],
  warehouses: Warehouse[],
  brandImage: HTMLImageElement | null
): void {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);
  ctx.scale(scale, scale);

  const x = -phoneW / 2;
  const y = -phoneH / 2;
  const radius = phoneW * 0.12;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = phoneW * 0.18;
  ctx.shadowOffsetY = phoneW * 0.08;
  fillRoundRect(ctx, x, y, phoneW, phoneH, radius, '#0f172a');
  ctx.restore();

  const frameGrad = ctx.createLinearGradient(x, y, x + phoneW, y + phoneH);
  frameGrad.addColorStop(0, '#475569');
  frameGrad.addColorStop(0.5, '#1e293b');
  frameGrad.addColorStop(1, '#334155');
  fillRoundRect(ctx, x, y, phoneW, phoneH, radius, frameGrad);
  strokeRoundRect(ctx, x, y, phoneW, phoneH, radius, 'rgba(200, 151, 63, 0.38)', 2.5);

  const bezel = phoneW * 0.032;
  const sw = phoneW - bezel * 2;
  const sh = phoneH - bezel * 2;
  const sx = x + bezel;
  const sy = y + bezel;
  const screenRadius = radius - bezel * 0.7;

  fillRoundRect(ctx, sx, sy, sw, sh, screenRadius, '#000000');

  ctx.save();
  roundedRectPath(ctx, sx, sy, sw, sh, screenRadius);
  ctx.clip();
  ctx.translate(sx, sy);
  drawCustomerAppScreen(ctx, sw, sh, timeSec, offers, categories, warehouses, brandImage);
  ctx.restore();

  const pillW = phoneW * 0.27;
  const pillH = phoneW * 0.065;
  fillRoundRect(ctx, -pillW / 2, sy + bezel * 0.65, pillW, pillH, pillH / 2, '#020617');

  const glare = ctx.createLinearGradient(sx, sy, sx + sw * 0.85, sy + sh * 0.55);
  glare.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  glare.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)');
  glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
  fillRoundRect(ctx, sx, sy, sw, sh, screenRadius, glare);

  ctx.restore();
}

function drawSubtitleBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  subtitle: string,
  S: number,
  isPortrait: boolean
): void {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  const fontSize = Math.round((isPortrait ? 33 : 36) * S);
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`;

  const textW = ctx.measureText(subtitle).width;
  const boxW = Math.min(w * 0.92, textW + 76 * S);
  const boxH = fontSize * 1.95;
  const boxX = (w - boxW) / 2;
  const boxY = h - boxH - (isPortrait ? 82 * S : 46 * S);

  fillRoundRect(ctx, boxX, boxY, boxW, boxH, 14 * S, 'rgba(8, 12, 9, 0.8)');
  strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 14 * S, 'rgba(200, 151, 63, 0.4)', 1.5 * S);

  ctx.fillStyle = '#f8fafc';
  drawClippedRtlText(ctx, subtitle, w / 2, boxY + boxH * 0.64, boxW - 36 * S, 'center');
  ctx.restore();
}

function drawSceneEditorialCopy(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number,
  S: number,
  isPortrait: boolean,
  brandImage: HTMLImageElement | null
): void {
  let kicker = '';
  let headline = '';
  let bullets: string[] = [];

  if (timeSec < 25.0) {
    kicker = '01 • الواجهة الرئيسية للعميل';
    headline = 'سوق الفرص والمخزون في مكان واحد';
    bullets = ['هوية واضحة وتوثيق المنشأة النشطة', 'وصول مباشر للعروض والمستودعات والصفقات'];
  } else if (timeSec < 40.0) {
    kicker = '02 • التصفح والتصفية الجغرافية';
    headline = 'ابحث بالأصناف أو بالأقرب لموقعك';
    bullets = ['تصفية حسب التصنيف والسعر والبائع', 'تفعيل البحث بالأقرب (كم) لتحديد نطاق التوصيل'];
  } else if (timeSec < 54.0) {
    kicker = '03 • تفاصيل العرض والأسئلة';
    headline = 'معلومات شفافة وتواصل مباشر مع البائع';
    bullets = ['سعر الوحدة، المتاح حالياً، والحد الأدنى للطلب', 'تسجيل الاهتمام والأسئلة الموثقة على العرض'];
  } else if (timeSec < 68.0) {
    kicker = '04 • خريطة المستودعات واللوجستيات';
    headline = 'تعرف على مواقع المستودعات بدقة';
    bullets = ['خريطة تفاعلية لمراكز التوزيع المسجّلة', 'إحداثيات واضحة لتسهيل خطة الاستلام والتوصيل'];
  } else if (timeSec < 82.0) {
    kicker = '05 • لوحة طلبات الاحتياج (RFQ)';
    headline = 'اطلب احتياجك واستقبل عروض الأسعار';
    bullets = ['نشر طلب الاحتياج وتحديد الكمية والمدينة', 'مطابقات ذكية وعروض أسعار من الموردين'];
  } else if (timeSec < 97.0) {
    kicker = '06 • تقديم طلب الشراء';
    headline = 'اطلب من المتاح بخطوات واضحة';
    bullets = ['تحديد الكمية وآلية الاستلام أو التوصيل', 'البائع يراجع الطلب والحجز يحدث عند القبول'];
  } else {
    kicker = '07 • متابعة الصفقات وكود التسليم';
    headline = 'رؤية أوضح وتحكم كامل حتى الإغلاق';
    bullets = ['متابعة الطلب من الانتظار إلى الحجز والتجهيز', 'تأكيد الاستلام عبر كود التسليم عند البوابة'];
  }

  ctx.save();
  ctx.direction = 'rtl';

  if (isPortrait) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c8973f';
    ctx.font = `700 ${Math.round(28 * S)}px ${FONT_STACK}`;
    ctx.fillText(kicker, w / 2, h * 0.082);

    ctx.fillStyle = '#efeadf';
    ctx.font = `800 ${Math.round(42 * S)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, headline, w / 2, h * 0.132, w * 0.88, 'center');
  } else {
    const panelRight = w * 0.91;
    const topY = h * 0.28;

    const markDim = 68 * S;
    if (brandImage && brandImage.complete && brandImage.naturalWidth > 0) {
      ctx.drawImage(brandImage, panelRight - markDim, topY - markDim - 24 * S, markDim, markDim);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#c8973f';
    ctx.font = `700 ${Math.round(28 * S)}px ${FONT_STACK}`;
    ctx.fillText(kicker, panelRight, topY + 12 * S);

    ctx.fillStyle = '#efeadf';
    ctx.font = `800 ${Math.round(52 * S)}px ${FONT_STACK}`;
    drawClippedRtlText(ctx, headline, panelRight, topY + 86 * S, w * 0.43, 'right');

    for (let i = 0; i < bullets.length; i += 1) {
      const by = topY + 165 * S + i * 68 * S;
      fillRoundRect(ctx, panelRight - 14 * S, by - 16 * S, 14 * S, 14 * S, 4 * S, '#10b981');
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `600 ${Math.round(29 * S)}px ${FONT_STACK}`;
      drawClippedRtlText(ctx, bullets[i], panelRight - 32 * S, by, w * 0.41, 'right');
    }
  }

  ctx.restore();
}

export function renderCommercialFrame(
  ctx: CanvasRenderingContext2D,
  params: RenderFrameParams
): void {
  const {
    timeSec: rawTime,
    aspect,
    width: w,
    height: h,
    offers,
    categories,
    warehouses = [],
    brandImage,
    showSubtitles,
    scenes = COMMERCIAL_SCENES,
  } = params;
  const { canonicalSec: timeSec } = mapResolvedToCanonicalTime(rawTime, scenes);
  const isPortrait = aspect === '9:16';
  const S = w / (isPortrait ? 1080 : 1920);

  drawAtmosphereBackground(ctx, w, h, timeSec, S);

  // =========================================================================
  // SCENE 1 (0 - 6s): البداية السينمائية
  // =========================================================================
  if (timeSec < 6.0) {
    const p = clamp01(timeSec / 6.0);
    const logoAlpha = easeOutCubic(clamp01((timeSec - 0.6) / 1.8));
    const logoScale = lerp(0.84, 1.04, easeOutCubic(clamp01(timeSec / 5.6)));
    const fadeOut = timeSec > 5.3 ? 1 - easeInOutCubic((timeSec - 5.3) / 0.7) : 1;

    const beamX = lerp(-w * 0.3, w * 1.3, easeInOutCubic(p));
    const beam = ctx.createLinearGradient(beamX - 240 * S, 0, beamX + 240 * S, h);
    beam.addColorStop(0, 'rgba(200, 151, 63, 0)');
    beam.addColorStop(0.5, 'rgba(200, 151, 63, 0.16)');
    beam.addColorStop(1, 'rgba(200, 151, 63, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = logoAlpha * fadeOut;
    ctx.translate(w / 2, h * 0.44);
    ctx.scale(logoScale, logoScale);

    const halo = ctx.createRadialGradient(0, 0, 10 * S, 0, 0, 260 * S);
    halo.addColorStop(0, 'rgba(200, 151, 63, 0.34)');
    halo.addColorStop(0.5, 'rgba(16, 185, 129, 0.14)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 260 * S, 0, Math.PI * 2);
    ctx.fill();

    const logoDim = (isPortrait ? 220 : 210) * S;
    if (brandImage && brandImage.complete && brandImage.naturalWidth > 0) {
      ctx.drawImage(brandImage, -logoDim / 2, -logoDim / 2 - 48 * S, logoDim, logoDim);
    } else {
      fillRoundRect(ctx, -logoDim / 2, -logoDim / 2 - 48 * S, logoDim, logoDim, 36 * S, '#1f3d2b');
    }

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#efeadf';
    ctx.font = `800 ${Math.round(86 * S)}px ${FONT_STACK}`;
    ctx.fillText('حَصّـال', 0, logoDim * 0.55);

    ctx.fillStyle = '#c8973f';
    ctx.font = `700 ${Math.round(28 * S)}px ${FONT_STACK}`;
    ctx.fillText('H A S S A L', 0, logoDim * 0.78);
    ctx.restore();
  }

  // =========================================================================
  // SCENE 2 (6 - 14s): المشكلة والحاجة
  // =========================================================================
  else if (timeSec < 14.0) {
    const localT = timeSec - 6.0;
    const p = clamp01(localT / 8.0);
    const fadeIn = easeOutCubic(clamp01(localT / 0.7));
    const fadeOut = timeSec > 13.2 ? 1 - easeOutCubic((timeSec - 13.2) / 0.8) : 1;

    ctx.save();
    ctx.globalAlpha = fadeIn * fadeOut;

    const frictionLabels = [
      'بحث متفرّق عن الموردين',
      'اتصالات ومراجعات مطوّلة',
      'عدم وضوح الكمية المتاحة',
      'تعقيد متابعة الطلب يدوياً',
      'تأخر في تأكيد التوفر',
    ];
    const settle = easeInOutCubic(clamp01((localT - 3.6) / 3.5));

    for (let i = 0; i < frictionLabels.length; i += 1) {
      const spreadX = w * (0.2 + ((i * 0.17) % 0.65));
      const spreadY = h * (0.24 + ((i * 0.19) % 0.45));
      const driftX = Math.sin(localT * 0.9 + i * 1.4) * 38 * S * (1 - settle);
      const driftY = Math.cos(localT * 0.8 + i * 1.1) * 28 * S * (1 - settle);

      const cx = lerp(spreadX + driftX, w / 2, settle * 0.75);
      const cy = lerp(spreadY + driftY, h * 0.5, settle * 0.75);
      const cardW = (isPortrait ? 430 : 410) * S;
      const cardH = 82 * S;

      ctx.save();
      ctx.globalAlpha *= (1 - settle * 0.72) * 0.9;
      ctx.translate(cx, cy);
      ctx.rotate(((i % 2 === 0 ? 1 : -1) * 0.08) * (1 - settle));
      fillRoundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 14 * S, 'rgba(30, 41, 59, 0.78)');
      strokeRoundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 14 * S, 'rgba(148, 163, 184, 0.35)', 1.5 * S);
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `600 ${Math.round(25 * S)}px ${FONT_STACK}`;
      ctx.fillText(frictionLabels[i], 0, 9 * S);
      ctx.restore();
    }

    const focalAlpha = easeOutCubic(clamp01((localT - 2.0) / 1.5));
    ctx.save();
    ctx.globalAlpha *= focalAlpha;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';

    fillRoundRect(ctx, w / 2 - 350 * S, h * 0.38, 700 * S, 165 * S, 24 * S, 'rgba(14, 20, 16, 0.86)');
    strokeRoundRect(ctx, w / 2 - 350 * S, h * 0.38, 700 * S, 165 * S, 24 * S, 'rgba(200, 151, 63, 0.55)', 2 * S);

    ctx.fillStyle = '#c8973f';
    ctx.font = `800 ${Math.round((isPortrait ? 44 : 48) * S)}px ${FONT_STACK}`;
    ctx.fillText('لماذا البحث المعقّد؟', w / 2, h * 0.38 + 70 * S);

    ctx.fillStyle = '#efeadf';
    ctx.font = `600 ${Math.round((isPortrait ? 28 : 30) * S)}px ${FONT_STACK}`;
    ctx.fillText('حين يكون الوصول إلى الخدمة أسهل وأقرب', w / 2, h * 0.38 + 124 * S);
    ctx.restore();

    fillRoundRect(ctx, w * 0.25, h * 0.62, w * 0.5 * p, 4 * S, 2 * S, '#10b981');
    ctx.restore();
  }

  // =========================================================================
  // SCENES 3..9 (14 - 111s): Complete Customer App Walkthrough Inside Smartphone
  // =========================================================================
  else if (timeSec < 111.0) {
    const phoneW = (isPortrait ? 650 : 410) * S;
    const phoneH = phoneW * 2.06;

    let phoneX = isPortrait ? w * 0.5 : w * 0.32;
    let phoneY = isPortrait ? h * 0.55 : h * 0.51;
    let phoneScale = 1.0;
    let phoneRot = 0;

    if (timeSec < 25.0) {
      const e = easeOutCubic((timeSec - 14.0) / 1.4);
      phoneY = lerp(h * 1.15, isPortrait ? h * 0.54 : h * 0.5, e);
      phoneRot = lerp(-0.14, -0.02, e);
      phoneScale = lerp(0.86, 1.02, e);
    } else if (timeSec < 54.0) {
      const zoomP = easeInOutCubic(clamp01((timeSec - 25.5) / 3.5));
      phoneScale = lerp(1.02, isPortrait ? 1.15 : 1.2, zoomP);
      phoneRot = lerp(-0.02, 0.014, zoomP);
      phoneX = isPortrait ? w * 0.5 : lerp(w * 0.32, w * 0.36, zoomP);
      phoneY = isPortrait ? h * 0.54 : lerp(h * 0.5, h * 0.52, zoomP);
    } else {
      const settleRot = Math.sin(timeSec * 0.35) * 0.01;
      phoneScale = isPortrait ? 1.14 : 1.18;
      phoneRot = settleRot;
      phoneX = isPortrait ? w * 0.5 : w * 0.34;
      phoneY = isPortrait ? h * 0.55 : h * 0.51;
    }

    drawSceneEditorialCopy(ctx, w, h, timeSec, S, isPortrait, brandImage);

    drawSmartphoneDevice(
      ctx,
      phoneX,
      phoneY,
      phoneW,
      phoneH,
      phoneRot,
      phoneScale,
      timeSec,
      offers,
      categories,
      warehouses,
      brandImage
    );
  }

  // =========================================================================
  // SCENE 10 (111 - 120s): الخاتمة الإعلانية
  // =========================================================================
  else {
    const localT = timeSec - 111.0;
    const enter = easeOutCubic(clamp01(localT / 1.2));
    const phoneW = (isPortrait ? 470 : 370) * S;
    const phoneH = phoneW * 2.06;

    const phoneX = isPortrait ? w * 0.5 : lerp(w * 0.34, w * 0.28, enter);
    const phoneY = isPortrait ? h * 0.63 : h * 0.5;
    drawSmartphoneDevice(
      ctx,
      phoneX,
      phoneY,
      phoneW,
      phoneH,
      isPortrait ? 0 : -0.04,
      isPortrait ? 0.92 : 0.96,
      20.0,
      offers,
      categories,
      warehouses,
      brandImage
    );

    ctx.save();
    ctx.globalAlpha = enter;
    ctx.direction = 'rtl';

    const brandX = isPortrait ? w * 0.5 : w * 0.67;
    const brandY = isPortrait ? h * 0.23 : h * 0.45;
    const logoDim = (isPortrait ? 145 : 168) * S;

    if (brandImage && brandImage.complete && brandImage.naturalWidth > 0) {
      ctx.drawImage(
        brandImage,
        brandX - logoDim / 2,
        brandY - logoDim - 24 * S,
        logoDim,
        logoDim
      );
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#efeadf';
    ctx.font = `800 ${Math.round((isPortrait ? 62 : 76) * S)}px ${FONT_STACK}`;
    ctx.fillText('حصّال | خدماتك أقرب', brandX, brandY + 46 * S);

    ctx.fillStyle = '#c8973f';
    ctx.font = `700 ${Math.round((isPortrait ? 30 : 34) * S)}px ${FONT_STACK}`;
    ctx.fillText('HASSAL — طريقك الأسهل إلى الخدمة', brandX, brandY + 106 * S);

    ctx.restore();
  }

  if (showSubtitles) {
    const sub = getActiveSubtitleAtTime(rawTime, scenes);
    if (sub) {
      drawSubtitleBar(ctx, w, h, sub, S, isPortrait);
    }
  }
}
