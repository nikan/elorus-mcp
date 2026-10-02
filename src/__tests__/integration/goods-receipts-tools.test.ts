import { documentTests } from "./phase2-helpers.js";
import { registerGoodsReceiptTools } from "../../tools/goods-receipts.js";

documentTests("goods_receipt", "goods_receipts", "/goodsreceipts/", registerGoodsReceiptTools,
  { supplier: "123" }, { title: "Package", quantity: "2", unit_measure: "item", warehouse: "789" }, true);
