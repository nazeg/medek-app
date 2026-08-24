/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("courses");

  collection.fields.addAt(collection.fields.length - 1, new NumberField({
    "name": "pct_proje",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": 0,
      "max": 100,
      "noDecimal": true
    }
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("courses");

  collection.fields.removeByName("pct_proje");

  return app.save(collection);
});
