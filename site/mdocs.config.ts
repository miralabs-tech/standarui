import { defineConfig } from "@standardoc/cli";

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
  stylesheets: ["@standardoc/kit/styles/docs.css", "./demo.css"],
});
