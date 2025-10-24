import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
const prisma = new PrismaClient();

// Anti-spam basique (en mémoire)
const lastSubmissions = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

// Helper CORS
function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "https://a-mes-petits-ecoliers.onrender.com",
    "http://localhost:5173",
  ];
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// OPTIONS preflight
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

// GET all contacts (optionnel)
export async function GET(req: NextRequest) {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ contacts }, { headers: getCorsHeaders(req) });
}

// POST new contact
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
    const lastTime = lastSubmissions.get(email);
    if (lastTime && now - lastTime < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: "Trop de tentatives rapprochées." },
        { status: 429, headers: getCorsHeaders(req) }
      );
    }
    lastSubmissions.set(email, now);

    // === Stockage dans PostgreSQL via Prisma ===
    await prisma.contact.create({ data: { email } });

    // === Envoi via Brevo API ===
    const sendinblueApiKey = process.env.BREVO_API_KEY!;
    const siteEmail = process.env.BREVO_EMAIL!;

    // Mail vers site
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": sendinblueApiKey },
      body: JSON.stringify({
        sender: { name: "Site Coloriages", email: siteEmail },
        to: [{ email: siteEmail }],
        subject: "📬 Nouveau contact depuis le site",
        textContent: `Un visiteur a laissé son e-mail : ${email}`,
      }),
    });

    // Accusé de réception utilisateur
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": sendinblueApiKey },
      body: JSON.stringify({
        sender: { name: "Latifa - À mes petits écoliers", email: siteEmail },
        to: [{ email }],
        subject: "Merci pour ton message 🌷",
        textContent: `Bonjour 🌸\n\nMerci d’avoir pris contact ! Je te répondrai dès que possible.\n\nLatifa`,
      }),
    });

    return NextResponse.json({ success: true }, { headers: getCorsHeaders(req) });
  } catch (err) {
    console.error("Erreur /api/contact :", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
}
