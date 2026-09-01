/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("programs");

  try {
    if (!collection.fields.getByName("active")) {
      collection.fields.add(new BoolField({
        name: "active",
        type: "bool",
        required: false,
        presentable: false
      }));
    }
  } catch (e) {
    collection.fields.add(new BoolField({
      name: "active",
      type: "bool",
      required: false,
      presentable: false
    }));
  }

  return app.save(collection);
}, (app) => {
  return null;
});
