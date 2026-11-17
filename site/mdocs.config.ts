import { defineConfig } from "@standarx/mdocs/config";

export default defineConfig({
  siteName: "standarui",
  base: "/standarui/",
  contentDir: "content",
  locales: ["en", "fr"],
  demosDir: "demos",
  apiDir: "../packages/react/api",
  categories: [
    {
      slug: "start",
      label: "Getting started",
      labels: { fr: "Prise en main" },
      blurb: "What standarui is and how it reaches your app.",
      blurbs: { fr: "Ce qu'est standarui et comment il arrive dans votre app." },
    },
    {
      slug: "components",
      label: "Components",
      labels: { fr: "Composants" },
      blurb: "Headless parts and their composed forms.",
      blurbs: { fr: "Les parties headless et leurs formes composées." },
    },
  ],
  stylesheets: ["@standarx/mdocs/styles/docs.css", "./demo.css"],
});
