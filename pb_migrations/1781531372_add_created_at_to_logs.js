/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("logs");

  try {
    if (!collection.fields.getByName("created_at")) {
      collection.fields.add(new TextField({
        name: "created_at",
        type: "text",
        required: false,
        presentable: false
      }));
    }
  } catch (e) {
    collection.fields.add(new TextField({
      name: "created_at",
      type: "text",
      required: false,
      presentable: false
    }));
  }

  return app.save(collection);
}, (app) => {
  return null;
});
