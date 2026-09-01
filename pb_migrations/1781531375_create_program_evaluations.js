/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    const existing = app.findCollectionByNameOrId("program_evaluations");
    if (existing) {
      existing.listRule = "";
      existing.viewRule = "";
      existing.createRule = "";
      existing.updateRule = "";
      existing.deleteRule = "";
      return app.save(existing);
    }
  } catch (e) {
    // not exists, will create
  }

  const collection = new Collection({
    name: "program_evaluations",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      new TextField({
        name: "program",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "term_key",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "opinion",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "evaluator_name",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "evaluator_title",
        type: "text",
        required: false,
        presentable: false
      }),
      new TextField({
        name: "evaluator_date",
        type: "text",
        required: false,
        presentable: false
      })
    ]
  });

  return app.save(collection);
}, (app) => {
  return null;
});
