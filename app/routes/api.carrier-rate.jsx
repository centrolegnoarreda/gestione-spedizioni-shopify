import { unauthenticated } from "../shopify.server";

const WAREHOUSE_COORDS = {
  lng: 14.037080528961557,
  lat: 37.4960542217567,
};

async function geocodeAddressWithMapbox(address) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error("MAPBOX_TOKEN non configurato");

  const encoded = encodeURIComponent(address);
  const url =
    `https://api.mapbox.com/search/geocode/v6/forward` +
    `?q=${encoded}` +
    `&proximity=${WAREHOUSE_COORDS.lng},${WAREHOUSE_COORDS.lat}` +
    `&country=IT` +
    `&language=it` +
    `&access_token=${token}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Errore geocoding Mapbox: ${response.status}`);
  }

  const data = await response.json();
  const feature = data?.features?.[0];

  if (!feature || !feature.geometry?.coordinates) {
    throw new Error("Nessuna coordinata trovata per l'indirizzo cliente");
  }

  const [lng, lat] = feature.geometry.coordinates;
  return { lng, lat };
}

async function getRoadDistanceKmWithMapbox(destinationCoords) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error("MAPBOX_TOKEN non configurato");

  const coordinates =
    `${WAREHOUSE_COORDS.lng},${WAREHOUSE_COORDS.lat};` +
    `${destinationCoords.lng},${destinationCoords.lat}`;

  const url =
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}` +
    `?annotations=distance` +
    `&access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Errore Matrix Mapbox: ${response.status} - ${data?.message || "Errore sconosciuto"}`
    );
  }

  const meters = data?.distances?.[0]?.[1];
  if (typeof meters !== "number") {
    throw new Error("Distanza stradale non disponibile");
  }

  return meters / 1000;
}

function calculateExtraKmCost(distanceKm) {
  const roundedKm = Math.ceil(distanceKm);
  const extraKm = Math.max(0, roundedKm - 80);
  const extraCost = extraKm * 1;

  return {
    roundedKm,
    extraKm,
    extraCost,
  };
}

function singularOrPlural(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function totalQuantity(list) {
  return list.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function formatProductList(list) {
  return list
    .map((item) =>
      item.quantity > 1 ? `${item.productTitle} x${item.quantity}` : item.productTitle
    )
    .join(", ");
}

function buildDescriptions(normalizedVariants) {
  const storeAddress =
    "Indirizzo: Via Poggio Sant'Elia, 46, 93100 Caltanissetta (CL).";

  if (!normalizedVariants.length) {
    return {
      ritiroDescription:
        `${storeAddress}\n` +
        `Puoi ritirare il tuo ordine presso il nostro magazzino presentando la fattura d'acquisto.`,
      trasportoDescription:
        `Ti contatteremo per concordare insieme data e orario del servizio richiesto.`,
    };
  }

  const inStockVariants = normalizedVariants.filter((v) => v.disponibileSubito);
  const backorderVariants = normalizedVariants.filter((v) => v.suOrdinazione);

  const inStockVariantsCount = inStockVariants.length;
  const backorderVariantsCount = backorderVariants.length;

  const allInStock = inStockVariantsCount === normalizedVariants.length;
  const allBackorder = backorderVariantsCount === normalizedVariants.length;
  const mixedCart = inStockVariantsCount > 0 && backorderVariantsCount > 0;

  const slowestBackorderVariant = [...backorderVariants].sort(
    (a, b) => b.leadTimeMaxDays - a.leadTimeMaxDays
  )[0];

  const inStockQty = totalQuantity(inStockVariants);
  const backorderQty = totalQuantity(backorderVariants);

  const inStockProductLabel = singularOrPlural(
    inStockQty,
    "il prodotto",
    "i prodotti"
  );

  const inStockAvailableProductLabel = singularOrPlural(
    inStockQty,
    "il prodotto disponibile",
    "i prodotti disponibili"
  );

  const backorderProductLabel = singularOrPlural(
    backorderQty,
    "il prodotto",
    "i prodotti"
  );

  const backorderRemainingLabel = singularOrPlural(
    backorderQty,
    "il prodotto rimanente",
    "i prodotti rimanenti"
  );

  const backorderEstimatedLabel = singularOrPlural(
    backorderQty,
    "il prodotto su ordinazione",
    "i prodotti su ordinazione"
  );

  const inStockList = formatProductList(inStockVariants);
  const backorderList = formatProductList(backorderVariants);

  let ritiroDescription = "";
  if (allInStock) {
    ritiroDescription =
      `${storeAddress}\n` +
      `Puoi ritirare ${inStockProductLabel} presso il nostro magazzino presentando la fattura d'acquisto.\n` +
      `Prodotti disponibili subito: ${inStockList}.`;
  } else if (allBackorder && slowestBackorderVariant) {
    ritiroDescription =
      `${storeAddress}\n` +
      `Appena riceveremo ${backorderProductLabel}, ti contatteremo per il ritiro presso il nostro magazzino.\n` +
      `Tempo stimato: ${slowestBackorderVariant.leadTimeText}.\n` +
      `Prodotti su ordinazione: ${backorderList}.`;
  } else if (mixedCart && slowestBackorderVariant) {
    ritiroDescription =
      `${storeAddress}\n` +
      `Puoi ritirare ${inStockAvailableProductLabel} presso il nostro magazzino presentando la fattura d'acquisto.\n` +
      `Appena riceveremo ${backorderRemainingLabel}, ti contatteremo.\n` +
      `Tempo stimato per ${backorderEstimatedLabel}: ${slowestBackorderVariant.leadTimeText}.\n` +
      `Prodotti disponibili subito: ${inStockList}.\n` +
      `Prodotti su ordinazione: ${backorderList}.`;
  }

  let trasportoDescription = "";
  if (allInStock) {
    trasportoDescription =
      `Ti contatteremo per concordare insieme data e orario del servizio richiesto.\n` +
      `Tempo stimato: 1-2 giorni lavorativi.\n` +
      `Prodotti disponibili subito: ${inStockList}.`;
  } else if (slowestBackorderVariant) {
    trasportoDescription =
      `Appena riceveremo ${backorderProductLabel}, ti contatteremo per concordare insieme data e orario del servizio richiesto.\n` +
      `Tempo stimato: ${slowestBackorderVariant.leadTimeText}.\n` +
      (inStockVariants.length > 0
        ? `Prodotti disponibili subito: ${inStockList}.\n`
        : "") +
      `Prodotti su ordinazione: ${backorderList}.`;
  }

  return { ritiroDescription, trasportoDescription };
}

function getSubtotalFromRate(rate, items) {
  const itemsSubtotal =
    items.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const quantity = Number(item?.quantity || 0);
      return sum + price * quantity;
    }, 0) / 100;

  if (itemsSubtotal > 0) return itemsSubtotal;

  const fallbackSubtotal = Number(rate?.order_totals?.subtotal_price || 0) / 100;
  if (fallbackSubtotal > 0) return fallbackSubtotal;

  const fallbackTotal = Number(rate?.order_totals?.total_price || 0) / 100;
  return fallbackTotal > 0 ? fallbackTotal : 0;
}

export async function action({ request }) {
  try {
    const body = await request.json();
    const rate = body?.rate;

    console.log("Carrier payload ricevuto:", JSON.stringify(body, null, 2));

    if (!rate) {
      console.log("Payload rate mancante");
      return Response.json({ rates: [] }, { status: 200 });
    }

    const destination = rate.destination || {};
    const items = rate.items || [];
    const currency = rate.currency || "EUR";

    const addressParts = [
      destination.address1,
      destination.address2,
      destination.postal_code || destination.zip,
      destination.city,
      destination.province,
      destination.country,
    ].filter(Boolean);

    const fullCustomerAddress = addressParts.join(", ");

    const country = String(destination.country || "").toUpperCase();
    const province = String(destination.province || "").trim().toUpperCase();

    const siciliaProvince = ["AG", "CL", "CT", "EN", "ME", "PA", "RG", "SR", "TP"];
    const siciliaProvinceNames = [
      "AGRIGENTO",
      "CALTANISSETTA",
      "CATANIA",
      "ENNA",
      "MESSINA",
      "PALERMO",
      "RAGUSA",
      "SIRACUSA",
      "TRAPANI",
      "SICILIA",
      "SICILY",
    ];

    const isSicilia =
      country === "IT" &&
      (siciliaProvince.includes(province) || siciliaProvinceNames.includes(province));

    const trasportoConsentitoPerArea = isSicilia;

    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    if (!shop) {
      throw new Error("SHOPIFY_STORE_DOMAIN non configurato");
    }

    const rawVariantIds = items
      .map((item) => item.variant_id || item.variantId)
      .filter(Boolean);

    const variantIds = rawVariantIds.map((id) => {
      const stringId = String(id);
      return stringId.startsWith("gid://shopify/ProductVariant/")
        ? stringId
        : `gid://shopify/ProductVariant/${stringId}`;
    });

    let normalizedVariants = [];

    if (variantIds.length > 0) {
      console.log("Variant IDs trovate:", variantIds);

      const { admin } = await unauthenticated.admin(shop);

      const variantQuery = `
        query GetVariants($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              title
              inventoryQuantity
              product {
                title
              }
              metafield(namespace: "custom", key: "ordinabile") {
                value
              }
              leadTimeText: metafield(namespace: "custom", key: "lead_time_text") {
                value
              }
              leadTimeMaxDays: metafield(namespace: "custom", key: "lead_time_max_days") {
                value
              }
            }
          }
        }
      `;

      const variantResponse = await admin.graphql(variantQuery, {
        variables: { ids: variantIds },
      });

      const variantJson = await variantResponse.json();
      const variants = (variantJson?.data?.nodes || []).filter(Boolean);

      console.log("Varianti lette da Shopify:", JSON.stringify(variants, null, 2));

      if (variants.length > 0) {
        const itemMap = new Map(
          items.map((item) => {
            const rawId = item.variant_id || item.variantId;
            if (!rawId) return [null, item];

            const gid = String(rawId).startsWith("gid://shopify/ProductVariant/")
              ? String(rawId)
              : `gid://shopify/ProductVariant/${rawId}`;

            return [gid, item];
          })
        );

        normalizedVariants = variants.map((variant) => {
          const inventoryQuantity = Number(variant.inventoryQuantity ?? 0);
          const ordinabile = variant?.metafield?.value === "true";
          const leadTimeText = variant?.leadTimeText?.value || "Tempi da confermare";
          const leadTimeMaxDays = Number(variant?.leadTimeMaxDays?.value || 0);

          const disponibileSubito = inventoryQuantity > 0;
          const suOrdinazione = inventoryQuantity <= 0 && ordinabile;
          const acquistabile = disponibileSubito || suOrdinazione;

          const cartItem = itemMap.get(variant.id);
          const quantity = Number(cartItem?.quantity || 1);

          const productTitle =
            variant?.product?.title && variant.title !== "Default Title"
              ? `${variant.product.title} - ${variant.title}`
              : variant?.product?.title || variant.title || "Prodotto";

          return {
            id: variant.id,
            productTitle,
            quantity,
            inventoryQuantity,
            ordinabile,
            leadTimeText,
            leadTimeMaxDays,
            disponibileSubito,
            suOrdinazione,
            acquistabile,
          };
        });

        const allPurchasable = normalizedVariants.every((v) => v.acquistabile);
        if (!allPurchasable) {
          console.log(
            "Ordine non servibile: almeno una variante non è acquistabile",
            JSON.stringify(normalizedVariants, null, 2)
          );
          return Response.json({ rates: [] }, { status: 200 });
        }
      } else {
        console.log("Nessuna variante trovata via Admin API, uso fallback");
      }
    } else {
      console.log("Payload senza variant_id: uso fallback senza query Shopify");
    }

    const { ritiroDescription, trasportoDescription } =
      buildDescriptions(normalizedVariants);

    const subtotal = getSubtotalFromRate(rate, items);
    console.log("Subtotal calcolato:", subtotal);

    let extraCost = 0;

    if (trasportoConsentitoPerArea) {
      const destinationCoords = await geocodeAddressWithMapbox(fullCustomerAddress);
      const kmDestinazione = await getRoadDistanceKmWithMapbox(destinationCoords);

      const distanceData = calculateExtraKmCost(kmDestinazione);
      extraCost = distanceData.extraCost;

      console.log("Distanza calcolata:", {
        fullCustomerAddress,
        kmDestinazione,
        roundedKm: distanceData.roundedKm,
        extraKm: distanceData.extraKm,
        extraCost: distanceData.extraCost,
      });
    }

    let tariffaBase = 0;
    if (subtotal <= 0) {
      tariffaBase = 0;
    } else if (subtotal <= 350) {
      tariffaBase = 38;
    } else if (subtotal <= 650) {
      tariffaBase = subtotal * 0.12;
    } else {
      tariffaBase = subtotal * 0.1;
    }

    const totaleFinale = Math.ceil((tariffaBase + extraCost) * 1.22);
    const totalPriceInCents = totaleFinale * 100;

    const rates = [];

    if (trasportoConsentitoPerArea) {
      rates.push({
        service_name: "Trasporto e Montaggio",
        service_code: "centrolegno_trasporto_montaggio",
        description: trasportoDescription,
        currency,
        total_price: String(totalPriceInCents),
      });
    }

    rates.push({
      service_name: "Ritiro in sede",
      service_code: "centrolegno_ritiro_sede",
      description: ritiroDescription,
      currency,
      total_price: "0",
    });

    const response = { rates };

    console.log("Carrier response:", JSON.stringify(response, null, 2));
    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error("Errore carrier-rate:", error);
    return Response.json({ rates: [] }, { status: 200 });
  }
}
