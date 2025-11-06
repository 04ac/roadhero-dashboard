import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "RoadHero Dashboard",
  description: "Realtime pothole monitoring dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
