import { Router } from "express";

import { technologies } from "../../constants/technologies.js";

const router = Router();

router.get("/technologies", (_request, response) => {
  response.json({ data: technologies });
});

export const metadataRouter = router;
