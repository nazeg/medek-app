/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("courses");

  collection.fields.addAt(collection.fields.length - 1, new NumberField({
    "name": "pct_sunum",
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

  collection.fields.addAt(collection.fields.length - 1, new JSONField({
    "name": "custom_weights",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("courses");

  collection.fields.removeByName("pct_sunum");
  collection.fields.removeByName("custom_weights");

  return app.save(collection);
});
