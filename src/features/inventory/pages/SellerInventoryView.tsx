import React, { useEffect, useState } from 'react';
import { AlertCircle, Package, PlusCircle, Warehouse as WarehouseIcon, X } from 'lucide-react';
import type { ApiResult, Pagination } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import { getProducts } from '@/features/catalog/api';
import type { Product } from '@/features/catalog/types';
import { getWarehouses } from '../api';
import type { Warehouse } from '../types';
import { getMyOffers } from '@/features/marketplace/api';
import type { Offer } from '@/features/marketplace/types';
import {
  SELLER_OFFER_ACTIONS,
  runSellerAction,
  type SellerRequestAction,
} from '@/features/marketplace/offer-actions';
import { offerCreatedNotice } from '@/features/marketplace/labels';
import { OFFER_REFUSAL_CODES, normalizeOffer } from '@/features/marketplace/offer';
import { EditOfferSheet } from '@/features/marketplace/components/EditOfferSheet';
import { OfferFormSheet } from '@/features/marketplace/components/OfferFormSheet';
import { OfferShelfTable } from '@/features/marketplace/components/OfferShelfTable';
import { StockMovementsPanel } from '../components/StockMovementsPanel';
import { WarehouseFormSheet } from '../components/WarehouseFormSheet';
import { WarehouseGrid } from '../components/WarehouseGrid';

interface SellerInventoryViewProps {
  currentPersonaId: string;
}

/**
 * The seller's own shelf: what this business has offered, where it sits, and what
 * has moved on it.
 *
 * This page is a composition, and it holds only what a page has to hold: the rows
 * that were read, the page number, the busy flag, and which sheet is open. Everything
 * it used to decide by itself is in the module that owns the subject now — a listing's
 * fields and their limits in `marketplace/offer`, the states a seller may still act on
 * in `marketplace/offer-actions`, a warehouse's rules in `inventory/warehouse`, a
 * movement's in `inventory/stock-movement`, and what a refusal means in
 * `core/api/refusal`. The split is not tidiness: this file was two thousand lines, and
 * the two offer forms that grew inside it had started to disagree about the same rule —
 * which box carries the minimum-versus-total complaint, and which states get a withdraw
 * button. A rule written twice drifts again; written once it can be checked against the
 * PHP that enforces it.
 *
 * Each sheet owns its own field state, so an accidental close costs a reopened sheet
 * rather than a lost form. The page keeps only rows, and reloads them after every
 * write, because the honest version of a quantity is the one the platform holds.
 */
export const SellerInventoryView: React.FC<SellerInventoryViewProps> = ({ currentPersonaId }) => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [offerSheetOpen, setOfferSheetOpen] = useState(false);
  /** `null` while creating; the row whose values prefill the sheet. */
  const [warehouseTarget, setWarehouseTarget] = useState<Warehouse | null>(null);
  const [warehouseSheetOpen, setWarehouseSheetOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  const loadOffers = async (targetPage: number) => {
    setLoading(true);
    setShelfError(null);
    try {
      // One round trip for the three lists the shelf and its sheets read; a warehouse
      // or a product the account cannot see empties that picker rather than the page,
      // and the seller finds out from the sheet's own notice, not a blank box.
      const [offersResult, warehousesResult, productsResult] = await Promise.all([
        getMyOffers({ page: targetPage }),
        getWarehouses(),
        getProducts(),
      ]);
      if (offersResult.success && Array.isArray(offersResult.data)) {
        setOffers((offersResult.data as Offer[]).map(normalizeOffer));
        setPagination(offersResult.pagination ?? null);
      } else {
        // A shelf the account may not read is a fact about permissions, not an empty shelf.
        setOffers([]);
        setPagination(null);
        setShelfError(
          explainRefusal(offersResult, {
            fallback: 'تعذّر جلب الرف.',
            codes: OFFER_REFUSAL_CODES,
          })
        );
      }
      setWarehouses(
        warehousesResult.success && Array.isArray(warehousesResult.data)
          ? (warehousesResult.data as Warehouse[])
          : []
      );
      setProducts(
        productsResult.success && Array.isArray(productsResult.data) ? (productsResult.data as Product[]) : []
      );
    } catch (error) {
      console.error(error);
      setShelfError('تعذّر الاتصال بالمنصة؛ لم تُجلب بيانات الرف.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    void loadOffers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPersonaId]);

  /**
   * One action, one banner, one reload.
   *
   * The banner quotes the platform's own answer when it has one, because what the
   * seller came to check is the state the listing is now in — not the state the button
   * asked for.
   */
  const runAction = async (label: string, request: () => Promise<ApiResult<unknown>>) => {
    setBusy(true);
    setActionMessage(null);
    try {
      const result = await request();
      setActionMessage(
        result.success
          ? `${label}: ${result.message ?? 'تم'}`
          : `تعذّر «${label}» — ${explainRefusal(result, {
              fallback: 'رفض الخادم الطلب',
              codes: OFFER_REFUSAL_CODES,
            })}`
      );
    } catch (error) {
      console.error(error);
      setActionMessage(`تعذّر «${label}»: لم يستجب الخادم.`);
    } finally {
      setBusy(false);
      await loadOffers(page);
    }
  };

  const handleShelfAction = (action: SellerRequestAction, offer: Offer) => {
    void runAction(SELLER_OFFER_ACTIONS[action].recordLabel, () => runSellerAction(action, offer.id));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-6 sm:px-6 lg:px-8">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-hassal-line dark:bg-hassal-surface sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-black text-slate-900 dark:text-slate-100">
            عروض منشأتي ومستودعاتها
          </h2>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            كل ما طرحته المنشأة من مخزون بحالته لدى المنصة، مع الكمية المتاحة والمحجوزة لكل عرض. النشر في السوق
            قرارٌ للمنصة حين تكون المراجعة مفعّلة، والسحب يبقي الأثر في السجل.
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-nowrap">
          <button
            onClick={() => {
              setWarehouseTarget(null);
              setWarehouseSheetOpen(true);
            }}
            className="flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-200 dark:bg-hassal-raised dark:text-slate-200 dark:hover:bg-hassal-night"
          >
            <WarehouseIcon className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" />
            <span className="truncate">تسجيل مستودع</span>
          </button>

          <button
            onClick={() => setOfferSheetOpen(true)}
            className="flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
          >
            <PlusCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">طرح عرض جديد</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span className="min-w-0 flex-1 leading-relaxed">{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            aria-label="إغلاق الرسالة"
            className="shrink-0 cursor-pointer rounded-lg p-1 font-bold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <WarehouseGrid
        warehouses={warehouses}
        onCorrect={(warehouse) => {
          setWarehouseTarget(warehouse);
          setWarehouseSheetOpen(true);
        }}
      />

      <StockMovementsPanel offers={offers} reloadKey={`${currentPersonaId}:${page}`} />

      <div className="min-w-0 space-y-3">
        <h3 className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <Package className="w-4 h-4 text-emerald-700" />
          <span>
            عروضك ({pagination ? pagination.total_items : offers.length})
            {pagination && pagination.total_pages > 1
              ? ` — صفحة ${pagination.current_page} من ${pagination.total_pages}`
              : ''}
          </span>
        </h3>

        {shelfError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0">{shelfError}</span>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-400">
            جارٍ جلب الرف...
          </div>
        ) : offers.length === 0 && !shelfError ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs leading-relaxed text-slate-500 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-400">
            لا عروض للمنشأة بعد. اضغط «طرح عرض جديد» لتسجيل مخزونك بمكان تخزينه وسبب طرحه.
          </div>
        ) : (
          <OfferShelfTable
            offers={offers}
            busy={busy}
            onEdit={(offer) => setEditingOffer(offer)}
            onAction={handleShelfAction}
          />
        )}

        {pagination && pagination.total_pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <button
              disabled={busy || pagination.current_page <= 1}
              onClick={() => {
                const next = pagination.current_page - 1;
                setPage(next);
                void loadOffers(next);
              }}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-200"
            >
              السابقة
            </button>
            <span className="min-w-0 basis-full text-center sm:basis-auto">
              {pagination.total_items} عرضاً — صفحة {pagination.current_page} من {pagination.total_pages}
            </span>
            <button
              disabled={busy || !pagination.has_more}
              onClick={() => {
                const next = pagination.current_page + 1;
                setPage(next);
                void loadOffers(next);
              }}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-200"
            >
              التالية
            </button>
          </div>
        )}
      </div>

      {offerSheetOpen && (
        <OfferFormSheet
          products={products}
          warehouses={warehouses}
          onClose={() => setOfferSheetOpen(false)}
          onCreated={(status) => {
            setOfferSheetOpen(false);
            setActionMessage(offerCreatedNotice(status));
            setPage(1);
            void loadOffers(1);
          }}
        />
      )}

      {warehouseSheetOpen && (
        <WarehouseFormSheet
          warehouse={warehouseTarget}
          onClose={() => setWarehouseSheetOpen(false)}
          onSaved={async (message) => {
            setWarehouseSheetOpen(false);
            setActionMessage(message);
            await loadOffers(page);
          }}
        />
      )}

      {editingOffer && (
        <EditOfferSheet
          offer={editingOffer}
          onClose={() => setEditingOffer(null)}
          onSaved={async (message) => {
            setEditingOffer(null);
            setActionMessage(message);
            await loadOffers(page);
          }}
        />
      )}
    </div>
  );
};
