import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
const prisma = new PrismaClient();

// --- CORS --- //
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

// --- OPTIONS (préflight) --- //
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

// --- GET --- //
export async function GET(req: NextRequest) {
  try {
    const comments = await prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments }, { headers: getCorsHeaders(req) });
  } catch (error) {
    console.error("Erreur GET /api/comments :", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
}

// --- POST --- //
export async function POST(req: NextRequest) {
  try {
    const { name, message } = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message vide" },
        { status: 400, headers: getCorsHeaders(req) }
      );
    }

    const comment = await prisma.comment.create({
      data: {
        name: name?.trim() || "Anonyme",
        message: message.trim(),
      },
    });

    return NextResponse.json(
      { success: true, comments: [comment] },
      { headers: getCorsHeaders(req) }
    );
  } catch (err) {
    console.error("Erreur POST /api/comments :", err);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
}
