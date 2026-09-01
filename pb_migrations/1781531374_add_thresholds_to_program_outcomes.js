/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("program_outcomes");

  const fieldsToAdd = [
    new NumberField({
      name: "min_threshold",
      type: "number",
      required: false,
      min: 0,
      max: 100,
      presentable: false
    }),
    new NumberField({
      name: "target_goal",
      type: "number",
      required: false,
      min: 0,
      max: 100,
      presentable: false
    }),
    new TextField({
      name: "evidence",
      type: "text",
      required: false,
      presentable: false
    })
  ];

  fieldsToAdd.forEach(field => {
    try {
      if (!collection.fields.getByName(field.name)) {
        collection.fields.add(field);
      }
    } catch (e) {
      collection.fields.add(field);
    }
  });

  return app.save(collection);
}, (app) => {
  return null;
});
