// ══════════════════════════════════════
// VOCELIA — Backend Server v2
// Parcours + Modules · Resend · Stripe
// ══════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── In-memory store ──
const devisStore = new Map();

// ── Middleware (webhook AVANT json parser) ──
app.post('/api/webhook', express.raw({ type: 'application/json' }), handleWebhook);
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ── Resend ──
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'Vocelia <onboarding@resend.dev>';

async function sendEmail(to, subject, html) {
  try {
    await resend.emails.send({ from: FROM_EMAIL, to: [to], subject, html });
    console.log(`📧 Email envoyé à ${to}`);
  } catch (err) {
    console.error(`❌ Erreur email ${to}:`, err.message);
  }
}

// ── Couleurs emails ──
const C = {
  ink: '#1C1F2E', teal: '#0B7A75', teal2: '#12B5AE', coral: '#E8603C',
  sand: '#F6F1E9', sand2: '#EDE6D8', cream: '#FFFDF8', muted: '#6B7280', border: '#D8CEBC'
};

// ══════════════════════════════════════
// POST /api/devis — Soumettre un devis
// ══════════════════════════════════════
app.post('/api/devis', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();
    const ref = 'VCL-' + Date.now().toString(36).toUpperCase();

    const entry = { id, ref, status: 'en_attente', createdAt: new Date().toISOString(), ...d };
    devisStore.set(id, entry);

    const tx = d.profil === 'entreprise' ? 'HT' : 'TTC';

    // ── Email admin ──
    await sendEmail(
      process.env.ADMIN_EMAIL,
      `📋 Nouveau devis ${ref} — ${d.nom || 'Client'} — ${d.total}`,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${C.cream};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">
        <div style="background:${C.ink};color:white;padding:1.5rem 2rem;">
          <h2 style="margin:0;">📋 Nouveau devis</h2>
          <p style="margin:0.3rem 0 0;opacity:0.7;font-size:0.9rem;">Réf: ${ref} — ${new Date().toLocaleDateString('fr-FR')}</p>
        </div>
        <div style="padding:2rem;">
          <p><strong>${d.nom || '—'}</strong>${d.societe ? ' — ' + d.societe : ''}<br>
          <span style="color:${C.muted};">${d.email || '—'} ${d.tel ? '· ' + d.tel : ''}</span></p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
            <tr style="background:${C.sand2};"><th style="text-align:left;padding:0.5rem 0.8rem;color:${C.teal};font-size:0.85rem;">Paramètre</th><th style="text-align:left;padding:0.5rem 0.8rem;color:${C.teal};font-size:0.85rem;">Valeur</th></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Profil</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};font-weight:bold;">${d.profil}</td></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Langue</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">${d.langue}</td></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Parcours</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">${d.parcours}</td></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Formule</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">${d.formule}</td></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Modalité</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">${d.modalite || '—'}</td></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Modules</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">${d.modules || 'Aucun'}</td></tr>
            <tr><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">Immersion</td><td style="padding:0.4rem 0.8rem;border-bottom:1px solid ${C.border};">${d.immersion || 'Aucune'}</td></tr>
          </table>
          <div style="text-align:right;font-size:1.4rem;font-weight:bold;color:${C.teal};margin:1rem 0;">Total : ${d.total}</div>
          ${d.message ? `<div style="background:${C.sand};padding:0.8rem 1rem;border-radius:8px;border-left:3px solid ${C.teal};margin:1rem 0;font-size:0.9rem;"><strong>Message :</strong><br>${d.message}</div>` : ''}
          <div style="text-align:center;margin-top:2rem;">
            <a href="${BASE_URL}/api/devis/${id}/valider" style="display:inline-block;padding:0.8rem 2rem;background:${C.teal};color:white;text-decoration:none;border-radius:8px;font-weight:bold;">✅ Valider ce devis</a>
            <p style="color:${C.muted};font-size:0.8rem;margin-top:0.8rem;">Le client recevra un lien de paiement.</p>
          </div>
        </div>
      </div>`
    );

    // ── Email client ──
    if (d.email) {
      await sendEmail(d.email,
        `✅ Devis ${ref} reçu — Vocelia`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${C.cream};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">
          <div style="background:${C.ink};color:white;padding:1.5rem 2rem;">
            <h2 style="margin:0;">Vocelia</h2>
            <p style="margin:0.3rem 0 0;opacity:0.7;">Devis ${ref}</p>
          </div>
          <div style="padding:2rem;">
            <p>Bonjour${d.nom ? ' ' + d.nom.split(' ')[0] : ''},</p>
            <p>Nous avons bien reçu votre demande de devis pour une formation en <strong>${d.langue}</strong>.</p>
            <p>Parcours : <strong>${d.parcours}</strong> — Formule : <strong>${d.formule}</strong></p>
            <p style="font-size:1.2rem;font-weight:bold;color:${C.teal};">Montant estimé : ${d.total}</p>
            <p>Notre équipe examine votre demande et vous enverra un lien de paiement sécurisé sous 48h.</p>
            <p style="color:${C.muted};font-size:0.85rem;margin-top:1.5rem;">Questions ? vocelia.formation@gmail.com · 06 84 15 97 01</p>
            <p>À très bientôt,<br><strong>L'équipe Vocelia</strong></p>
          </div>
        </div>`
      );
    }

    res.json({ success: true, ref, id });
  } catch (err) {
    console.error('Erreur POST /api/devis:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════
// GET /api/devis/:id/valider — Admin valide
// ══════════════════════════════════════
app.get('/api/devis/:id/valider', async (req, res) => {
  try {
    const entry = devisStore.get(req.params.id);
    if (!entry) return res.status(404).send('Devis introuvable.');
    if (entry.status !== 'en_attente') {
      return res.send(`<html><body style="font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${C.sand};"><div style="text-align:center;"><h2>✅ Devis déjà traité</h2><p>Réf: ${entry.ref}</p></div></body></html>`);
    }

    entry.status = 'valide';

    if (entry.email) {
      const paymentUrl = `${BASE_URL}/paiement.html?devis=${entry.id}`;
      await sendEmail(entry.email,
        `💳 Devis ${entry.ref} validé — Paiement`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${C.cream};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">
          <div style="background:${C.teal};color:white;padding:1.5rem 2rem;">
            <h2 style="margin:0;">Devis validé !</h2>
            <p style="margin:0.3rem 0 0;opacity:0.8;">Réf: ${entry.ref}</p>
          </div>
          <div style="padding:2rem;">
            <p>Bonjour${entry.nom ? ' ' + entry.nom.split(' ')[0] : ''},</p>
            <p>Votre devis pour <strong>${entry.langue}</strong> (${entry.parcours}) a été validé.</p>
            <div style="background:${C.sand};border-radius:8px;padding:1.2rem;text-align:center;margin:1.5rem 0;">
              <div style="font-size:0.8rem;color:${C.muted};text-transform:uppercase;">Montant</div>
              <div style="font-size:1.8rem;font-weight:bold;color:${C.teal};">${entry.total}</div>
            </div>
            <div style="text-align:center;margin:2rem 0;">
              <a href="${paymentUrl}" style="display:inline-block;padding:1rem 2.5rem;background:${C.teal};color:white;text-decoration:none;border-radius:8px;font-weight:bold;font-size:1.1rem;">💳 Payer maintenant</a>
            </div>
            <p style="color:${C.muted};font-size:0.82rem;">Paiement sécurisé par Stripe. Paiement intégral ou acompte 30%.</p>
          </div>
        </div>`
      );
    }

    res.send(`<html><body style="font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${C.sand};"><div style="text-align:center;max-width:450px;"><div style="font-size:3rem;">✅</div><h2 style="color:${C.teal};">Devis ${entry.ref} validé !</h2><p style="color:${C.muted};">Email de paiement envoyé à <strong>${entry.email}</strong>.</p></div></body></html>`);
  } catch (err) {
    console.error('Erreur validation:', err);
    res.status(500).send('Erreur serveur');
  }
});

// ══════════════════════════════════════
// GET /api/devis/:id — Infos devis
// ══════════════════════════════════════
app.get('/api/devis/:id', (req, res) => {
  const e = devisStore.get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Devis introuvable' });
  res.json({ ref: e.ref, status: e.status, profil: e.profil, langue: e.langue, parcours: e.parcours, formule: e.formule, total: e.total, nom: e.nom });
});

// ══════════════════════════════════════
// POST /api/checkout — Stripe Checkout
// ══════════════════════════════════════
app.post('/api/checkout', async (req, res) => {
  try {
    const { devisId, mode } = req.body;
    const e = devisStore.get(devisId);
    if (!e) return res.status(404).json({ error: 'Devis introuvable' });
    if (e.status !== 'valide') return res.status(400).json({ error: 'Devis non validé' });

    // Parse total (remove " €", "HT", "TTC", spaces)
    const totalNum = parseFloat(e.total.replace(/[^\d,.-]/g, '').replace(',', '.'));
    const totalCents = Math.round(totalNum * 100);
    const amount = mode === 'acompte' ? Math.round(totalCents * 0.3) : totalCents;
    const label = mode === 'acompte'
      ? `Acompte 30% — ${e.langue} (${e.parcours}) — ${e.ref}`
      : `Formation ${e.langue} (${e.parcours}) — ${e.ref}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'eur', product_data: { name: label }, unit_amount: amount }, quantity: 1 }],
      mode: 'payment',
      customer_email: e.email || undefined,
      metadata: { devisId: e.id, devisRef: e.ref, paymentMode: mode },
      success_url: `${BASE_URL}/paiement-succes.html?ref=${e.ref}&mode=${mode}`,
      cancel_url: `${BASE_URL}/paiement.html?devis=${e.id}&cancelled=1`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur Stripe:', err);
    res.status(500).json({ error: 'Erreur paiement' });
  }
});

// ══════════════════════════════════════
// POST /api/webhook — Webhook Stripe
// ══════════════════════════════════════
async function handleWebhook(req, res) {
  let event;
  try { event = JSON.parse(req.body); } catch { return res.status(400).send('Invalid'); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const e = devisStore.get(session.metadata?.devisId);
    if (e) {
      e.status = session.metadata.paymentMode === 'acompte' ? 'acompte_paye' : 'paye';
      e.paidAt = new Date().toISOString();

      const paid = session.metadata.paymentMode === 'acompte' ? Math.round(parseFloat(e.total.replace(/[^\d,.-]/g, '').replace(',', '.')) * 0.3) : e.total;

      await sendEmail(process.env.ADMIN_EMAIL,
        `💰 Paiement reçu — ${e.ref}`,
        `<div style="font-family:Arial;padding:2rem;"><h2 style="color:${C.teal};">💰 Paiement reçu</h2><p><strong>${e.ref}</strong> — ${e.nom}</p><p>Montant : ${paid}€</p><p>${e.langue} — ${e.parcours}</p></div>`
      );

      if (e.email) {
        await sendEmail(e.email,
          `✅ Paiement confirmé — ${e.ref}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${C.cream};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">
            <div style="background:${C.teal};color:white;padding:1.5rem 2rem;"><h2 style="margin:0;">Paiement confirmé !</h2></div>
            <div style="padding:2rem;">
              <p>Bonjour${e.nom ? ' ' + e.nom.split(' ')[0] : ''},</p>
              <p>Votre paiement pour la formation <strong>${e.langue}</strong> (${e.parcours}) a bien été reçu.</p>
              <p>Notre équipe vous recontactera pour planifier vos séances.</p>
              <p>Merci pour votre confiance !<br><strong>L'équipe Vocelia</strong></p>
            </div>
          </div>`
        );
      }
    }
  }
  res.json({ received: true });
}

// ══════════════════════════════════════
// START
// ══════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Vocelia Backend v2 — ${BASE_URL}`);
  console.log(`   POST /api/devis        → Soumettre`);
  console.log(`   GET  /api/devis/:id/val → Valider`);
  console.log(`   POST /api/checkout     → Stripe`);
  console.log(`   POST /api/webhook      → Webhook\n`);
});
