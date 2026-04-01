import { useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query GetVariants {
      productVariants(first: 20) {
        edges {
          node {
            id
            title
            sku
            inventoryQuantity
            product {
              title
            }
            ordinabile: metafield(namespace: "custom", key: "ordinabile") {
              value
            }
            leadTimeText: metafield(namespace: "custom", key: "lead_time_text") {
              value
            }
            leadTimeMaxDays: metafield(namespace: "custom", key: "lead_time_max_days") {
              value
            }
            serviziDisponibili: metafield(namespace: "custom", key: "servizi_disponibili") {
              value
            }
            noteLogistiche: metafield(namespace: "custom", key: "note_logistiche") {
              value
            }
          }
        }
      }
    }
  `);

  const responseJson = await response.json();
  const variants = responseJson.data.productVariants.edges.map((edge) => edge.node);

  return { variants };
};

export default function AppIndex() {
  const { variants } = useLoaderData();
  const [totaleOrdine, setTotaleOrdine] = useState("");
  const [kmDestinazione, setKmDestinazione] = useState("");
  const [destinazioneSicilia, setDestinazioneSicilia] = useState("si");

  function getStatoLogistico(variant) {
  const scorte = Number(variant.inventoryQuantity ?? 0);
  const ordinabile = variant.ordinabile?.value === "true";

  if (scorte > 0) return "Disponibile subito";
  if (scorte <= 0 && ordinabile) return "Su ordinazione";
  return "Non disponibile";
}

function getLeadTimeEffettivo(variant) {
  const scorte = Number(variant.inventoryQuantity ?? 0);
  const ordinabile = variant.ordinabile?.value === "true";
  const leadTimeText = variant.leadTimeText?.value ?? "-";

  if (scorte > 0) return "Disponibile subito";
  if (scorte <= 0 && ordinabile) return leadTimeText;
  return "Non disponibile";
}

function getServizioEffettivo(variant) {
  const servizi = variant.serviziDisponibili?.value ?? "";

  if (servizi === "delivery,pickup") return "Trasporto e montaggio + Ritiro in sede";
  if (servizi === "delivery") return "Solo trasporto e montaggio";
  if (servizi === "pickup") return "Solo ritiro in sede";
  return "Nessun servizio";
}

function calcolaTariffa() {
  const totale = Number(totaleOrdine || 0);
  const km = Number(kmDestinazione || 0);

  if (destinazioneSicilia !== "si") {
    return {
      tariffaBase: 0,
      extraKm: 0,
      extraDistanza: 0,
      totaleFinale: 0,
      fuoriSicilia: true,
    };
  }

  let tariffaBase = 0;

  if (totale <= 0) {
    tariffaBase = 0;
  } else if (totale <= 350) {
    tariffaBase = 38;
  } else if (totale <= 650) {
    tariffaBase = totale * 0.12;
  } else {
    tariffaBase = totale * 0.10;
  }

  const extraKm = km > 80 ? km - 80 : 0;
  const extraDistanza = extraKm * 1;
  const totaleFinale = Math.ceil((tariffaBase + extraDistanza) * 1.22);

  return {
    tariffaBase,
    extraKm,
    extraDistanza,
    totaleFinale,
    fuoriSicilia: false,
  };
}
const risultatoTariffa = calcolaTariffa();
  return (
    <div style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
      <h1>Gestione spedizioni sito</h1>
      <p>Prime 20 varianti con metafield logistici</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "24px" }}>
        <thead>
          <tr>
            <th style={thStyle}>Prodotto</th>
            <th style={thStyle}>Variante</th>
            <th style={thStyle}>SKU</th>
            <th style={thStyle}>Scorte</th>
            <th style={thStyle}>Stato logistico</th>
            <th style={thStyle}>Ordinabile</th>
            <th style={thStyle}>Lead time effettivo</th>
            <th style={thStyle}>Lead time testo</th>
            <th style={thStyle}>Lead time max</th>
            <th style={thStyle}>Modalità di consegna</th>
            <th style={thStyle}>Servizi</th>
            <th style={thStyle}>Note</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant.id}>
              <td style={tdStyle}>{variant.product?.title || "-"}</td>
              <td style={tdStyle}>{variant.title || "-"}</td>
              <td style={tdStyle}>{variant.sku || "-"}</td>
              <td style={tdStyle}>{variant.inventoryQuantity ?? "-"}</td>
              <td style={tdStyle}>{getStatoLogistico(variant)}</td>
              <td style={tdStyle}>{variant.ordinabile?.value ?? "-"}</td>
              <td style={tdStyle}>{getLeadTimeEffettivo(variant)}</td>
              <td style={tdStyle}>{variant.leadTimeText?.value ?? "-"}</td>
              <td style={tdStyle}>{variant.leadTimeMaxDays?.value ?? "-"}</td>
              <td style={tdStyle}>{getServizioEffettivo(variant)}</td>
              <td style={tdStyle}>{variant.serviziDisponibili?.value ?? "-"}</td>
              <td style={tdStyle}>{variant.noteLogistiche?.value ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
  style={{
    marginTop: "32px",
    padding: "24px",
    border: "1px solid #ddd",
    background: "#fafafa",
    maxWidth: "700px",
  }}
>
  <h2 style={{ marginTop: 0 }}>Calcolatore trasporto e montaggio</h2>
  
  <div>
  <label style={{ display: "block", marginBottom: "6px", fontWeight: "bold" }}>
    Destinazione
  </label>
  <select
    value={destinazioneSicilia}
    onChange={(e) => setDestinazioneSicilia(e.target.value)}
    style={{ width: "100%", padding: "10px", fontSize: "16px" }}
  >
    <option value="si">Sicilia</option>
    <option value="no">Fuori Sicilia</option>
  </select>
</div>

  <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
    <div>
      <label style={{ display: "block", marginBottom: "6px", fontWeight: "bold" }}>
        Totale ordine (€)
      </label>
      <input
        type="number"
        value={totaleOrdine}
        onChange={(e) => setTotaleOrdine(e.target.value)}
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
      />
    </div>

    <div>
      <label style={{ display: "block", marginBottom: "6px", fontWeight: "bold" }}>
        Km destinazione
      </label>
      <input
        type="number"
        value={kmDestinazione}
        onChange={(e) => setKmDestinazione(e.target.value)}
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
      />
    </div>
  </div>

  <div style={{ marginTop: "24px", lineHeight: "1.8" }}>
  {risultatoTariffa.fuoriSicilia ? (
    <div style={{ color: "#b00020", fontWeight: "bold" }}>
      Destinazione fuori Sicilia: trasporto e montaggio non disponibile con tariffa standard.
    </div>
  ) : (
    <>
      <div><strong>Tariffa base:</strong> € {risultatoTariffa.tariffaBase.toFixed(2)}</div>
      <div><strong>Km extra oltre 80:</strong> {risultatoTariffa.extraKm}</div>
      <div><strong>Supplemento distanza:</strong> € {risultatoTariffa.extraDistanza.toFixed(2)}</div>
      <div><strong>Totale trasporto e montaggio:</strong> € {risultatoTariffa.totaleFinale.toFixed(2)}</div>
    </>
  )}
</div>
</div>
    </div>
  );
}

const thStyle = {
  border: "1px solid #ddd",
  padding: "10px",
  textAlign: "left",
  background: "#f6f6f7",
};

const tdStyle = {
  border: "1px solid #ddd",
  padding: "10px",
  textAlign: "left",
};