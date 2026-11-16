import { defineConfig } from "@standarx/mdocs/config";

export default defineConfig({
  siteName: "standarui",
  contentDir: "content/en",
  demosDir: "demos",
  apiDir: "../packages/react/api",
  categories: [
    {
      slug: "start",
      label: "Getting started",
      blurb: "What standarui is and how it reaches your app.",
    },
    {
      slug: "components",
      label: "Components",
      blurb: "Headless parts and their composed forms.",
    },
  ],
  stylesheets: ["@standarx/mdocs/styles/docs.css", "./demo.css"],
});
