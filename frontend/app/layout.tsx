import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";

const nunito = Nunito({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Pravko",
    template: "%s · Pravko",
  },
  description:
    "Pravko — pravna aplikacija za zakone, pitanja i odgovore, analizu i generisanje ugovora po pravu Republike Srbije.",
  applicationName: "Pravko",
  icons: {
    icon: "/logo-tr.png",
    apple: "/logo-tr.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sr"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${nunito.className} min-h-full flex flex-col`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
