/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("students");
  const coursesCollection = app.findCollectionByNameOrId("courses");

  collection.fields.addAt(collection.fields.length - 1, new RelationField({
    "name": "courses",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "cascadeDelete": false,
    "collectionId": coursesCollection.id,
    "maxSelect": 200,
    "minSelect": 0
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("students");

  collection.fields.removeByName("courses");

  return app.save(collection);
});
