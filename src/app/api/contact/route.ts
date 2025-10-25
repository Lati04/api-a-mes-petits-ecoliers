import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";


export const runtime = "nodejs";
const prisma = new PrismaClient();

// --- Anti-spam ---
const lastSubmissions = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

// --- CORS ---
function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "https://a-mes-petits-ecoliers.onrender.com",
    "http://localhost:5173",
  ];
  const isAllowed = allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// --- OPTIONS (préflight) ---
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

// --- POST contact ---
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: "Adresse e-mail invalide." },
        { status: 400, headers: getCorsHeaders(req) }
      );
    }

    // Anti-spam
    const now = Date.now();
    if (lastSubmissions.get(email) && now - lastSubmissions.get(email)! < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: "Trop de tentatives rapprochées." },
        { status: 429, headers: getCorsHeaders(req) }
      );
    }
    lastSubmissions.set(email, now);

    // === ENREGISTREMENT BDD ===
    try {
      await prisma.contact.create({ data: { email } });
      console.log("Contact enregistré en BDD :", email);
    } catch (dbErr) {
      console.error("Erreur BDD :", dbErr);
      return NextResponse.json(
        { error: "Impossible d'enregistrer le contact." },
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    // === ENVOI EMAIL via API Brevo ===
    try {
      const BREVO_API_KEY = process.env.BREVO_API_KEY;
      const CONTACT_EMAIL = process.env.CONTACT_EMAIL;

      if (!BREVO_API_KEY || !CONTACT_EMAIL) {
        throw new Error("Clé API Brevo ou email contact manquant");
      }

      const bodyToAdmin = {
        sender: { name: "À mes petits écoliers", email: CONTACT_EMAIL },
        to: [{ email: CONTACT_EMAIL }],
        subject: "📬 Nouveau contact depuis le site",
        textContent: `Un visiteur a laissé son e-mail : ${email}`,
      };

      const bodyToVisitor = {
        sender: { name: "Latifa - À mes petits écoliers", email: CONTACT_EMAIL },
        to: [{ email }],
        subject: "Merci pour ton message 🌷",
        textContent: `Bonjour 🌸\n\nMerci d’avoir pris contact ! Je te répondrai dès que possible.\n\nLatifa`,
      };

      // Vers moi
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify(bodyToAdmin),
      });

      // Vers le visiteur
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify(bodyToVisitor),
      });

      console.log("Emails envoyés via Brevo :", email);
    } catch (mailErr) {
      console.error("Erreur API Brevo :", mailErr);
      return NextResponse.json(
        { error: "Impossible d'envoyer l'email. Vérifie la clé API." },
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    return NextResponse.json({ success: true }, { headers: getCorsHeaders(req) });
  } catch (err) {
    console.error("Erreur POST /api/contact :", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
}
