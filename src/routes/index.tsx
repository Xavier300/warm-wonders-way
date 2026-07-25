import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Official EcoBarangay — Community Sustainability Platform" },
      {
        name: "description",
        content:
          "Official EcoBarangay is a community platform for tracking waste, rewards, and sustainability initiatives in your barangay.",
      },
      { property: "og:title", content: "Official EcoBarangay" },
      {
        property: "og:description",
        content:
          "Track waste, earn rewards, and build a greener barangay with Official EcoBarangay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/proto/signin.html");
  }, []);
  return null;
}
