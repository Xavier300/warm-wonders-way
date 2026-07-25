import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoBarangay — Community Sustainability Platform" },
      {
        name: "description",
        content:
          "EcoBarangay is an interactive community platform for tracking waste, rewards, and sustainability initiatives in your barangay.",
      },
      { property: "og:title", content: "EcoBarangay — Community Sustainability Platform" },
      {
        property: "og:description",
        content:
          "Track waste, earn rewards, and build a greener barangay with EcoBarangay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/proto/ecobarangay.html"
      title="EcoBarangay Prototype"
      style={{
        border: "none",
        width: "100vw",
        height: "100vh",
        display: "block",
      }}
    />
  );
}
