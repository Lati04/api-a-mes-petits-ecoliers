import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
const prisma = new PrismaClient();

// Anti-spam basique
const lastSubmissions = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "https://a-mes-petits-ecoliers.onrender.com",
    "http://localhost:5173",
  ];

  // Autorise toujours front principal
  const allowOrigin =
    allowedOrigins.find((o) => origin.startsWith(o)) ||
    "https://a-mes-petits-ecoliers.onrender.com";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// OPTIONS
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

// POST contact
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

    // Enregistre dans la BDD
    await prisma.contact.create({ data: { email } });

    // === CONFIGURATION SMTP Brevo ===
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_EMAIL, 
        pass: process.env.BREVO_SMTP_PASSWORD, 
      },
    });

    // Envoi vers moi
    await transporter.sendMail({
      from: `"À mes petits écoliers" <${process.env.BREVO_EMAIL}>`,
      to: process.env.CONTACT_EMAIL,
      subject: "📬 Nouveau contact depuis le site",
      text: `Un visiteur a laissé son e-mail : ${email}`,
    });

    // Envoi vers le visiteur
    await transporter.sendMail({
      from: `"Latifa - À mes petits écoliers" <${process.env.BREVO_EMAIL}>`,
      to: email,
      subject: "Merci pour ton message 🌷",
      text: `Bonjour 🌸\n\nMerci d’avoir pris contact ! Je te répondrai dès que possible.\n\nLatifa`,
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
