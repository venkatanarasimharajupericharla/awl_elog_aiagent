/**
 * ODataService.js — CAPM OData V4 Service Layer for AWL ELog
 *
 * Fetches ElogForms + ElogFields from the deployed CAPM OData V4 service,
 * transforms them into the catalog.json format consumed by JouleEngine
 * and FormRenderer, and provides CRUD helpers for admin write-back.
 */
sap.ui.define([], function () {
	"use strict";

	var BASE_URL = "/sales-order";

	// ── helpers ──────────────────────────────────────────────────────────
	function _url(path) {
		return BASE_URL + path;
	}

	function _headers() {
		return {
			"Content-Type": "application/json;odata.metadata=minimal",
			"Accept": "application/json"
		};
	}

	/**
	 * Parse a CSV string into an array (trims whitespace).
	 * Returns undefined if the input is falsy or produces no entries.
	 */
	function _csvToArray(csv) {
		if (!csv) { return undefined; }
		var arr = csv.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
		return arr.length ? arr : undefined;
	}

	/**
	 * Transform a single OData ElogFields record into a catalog field object.
	 * Works for headerFields, grid.columns, and footerFields.
	 */
	function _transformField(oField) {
		var f = {
			key: oField.fieldKey || "",
			k: oField.fieldKey || "",             // grid columns use "k"
			label: oField.label || oField.fieldKey || "",
			type: oField.fieldType || "text",
			required: !!oField.required,
			section: oField.section || ""
		};

		// Options for select dropdowns
		var opts = _csvToArray(oField.options);
		if (opts) { f.options = opts; }

		// Default value
		if (oField.defaultValue) { f.value = oField.defaultValue; }

		// Column width (grid columns)
		if (oField.width) { f.w = oField.width; }

		if (oField.options) { f.optionsCsv = oField.options; }
		if (oField.validation) { f.validation = oField.validation; }

		// Preserve OData ID for write-back
		f._odata_ID = oField.ID;
		f._odata_form_ID = oField.form_ID;

		return f;
	}

	/**
	 * Build a single-row headerRows array from column labels.
	 * The existing FormRenderer doesn't strictly need headerRows for rendering
	 * (it uses column labels), but having them makes the data structure consistent.
	 */
	function _buildHeaderRows(columns) {
		if (!columns || !columns.length) { return []; }
		return [columns.map(function (c) { return { t: c.label || c.k }; })];
	}

	/**
	 * Transform a single OData ElogForms record (with expanded fields)
	 * into the catalog.json form structure.
	 */
	function _transformForm(oForm) {
		var fields = oForm.fields || [];

		// Sort by sortOrder (nulls last)
		fields.sort(function (a, b) {
			var sa = (a.sortOrder != null) ? a.sortOrder : 9999;
			var sb = (b.sortOrder != null) ? b.sortOrder : 9999;
			return sa - sb;
		});

		// Partition by fieldCategory
		var headerFields = [];
		var gridColumns = [];
		var footerFields = [];

		fields.forEach(function (f) {
			var cat = (f.fieldCategory || "").toLowerCase();
			var transformed = _transformField(f);
			if (cat === "header") {
				headerFields.push(transformed);
			} else if (cat === "grid") {
				gridColumns.push(transformed);
			} else if (cat === "footer") {
				footerFields.push(transformed);
			} else {
				// Default: treat as grid column
				gridColumns.push(transformed);
			}
		});

		// Build the form object
		var form = {
			id: oForm.formId || oForm.ID,
			name: oForm.name || "",
			documentNo: oForm.documentNo || "",
			plantId: oForm.plantId || "",
			departmentId: oForm.departmentId || "",
			section: oForm.section || "",
			frequency: oForm.frequency || "",
			entriesTitle: oForm.entriesTitle || "Entries",
			keywords: _csvToArray(oForm.keywords) || [],
			signature: oForm.signature || "",
			isActive: oForm.isActive !== false,
			// Preserve OData IDs for write-back
			_odata_ID: oForm.ID
		};

		// Plant and department names for display
		if (oForm.plantName) { form._plantName = oForm.plantName; }
		if (oForm.departmentName) { form._departmentName = oForm.departmentName; }

		// Header fields
		if (headerFields.length) {
			form.headerFields = headerFields;
		}

		// Grid
		if (gridColumns.length) {
			form.grid = {
				headerRows: _buildHeaderRows(gridColumns),
				columns: gridColumns,
				rows: { mode: "empty" }
			};
		}

		// Footer fields
		if (footerFields.length) {
			form.footerFields = footerFields;
		}

		return form;
	}

	// ── Public API ───────────────────────────────────────────────────────
	return {

		/**
		 * Fetch all ElogForms with expanded ElogFields from CAPM.
		 * Returns a Promise that resolves to an array of catalog-format form objects,
		 * or null on error (caller should use static fallback).
		 */
		fetchForms: function () {
			return fetch(_url("/ElogForms?$expand=fields&$orderby=name"), {
				method: "GET",
				headers: _headers()
			})
			.then(function (response) {
				if (!response.ok) {
					console.warn("[ODataService] ElogForms fetch failed:", response.status, response.statusText);
					return null;
				}
				return response.json();
			})
			.then(function (data) {
				if (!data || !data.value) { return null; }
				var forms = data.value
					.filter(function (f) { return f.isActive !== false; })
					.map(_transformForm);
				console.log("[ODataService] Loaded " + forms.length + " forms from CAPM");
				return forms;
			})
			.catch(function (err) {
				console.warn("[ODataService] Network error fetching ElogForms:", err);
				return null;
			});
		},

		// ── CRUD: Forms ─────────────────────────────────────────────────

		/**
		 * Create a new ElogForm.
		 * @param {object} oFormData - form properties (name, documentNo, etc.)
		 * @returns {Promise<object|null>} - created form record or null on error
		 */
		createForm: function (oFormData) {
			return fetch(_url("/ElogForms"), {
				method: "POST",
				headers: _headers(),
				body: JSON.stringify(oFormData)
			})
			.then(function (r) {
				if (!r.ok) {
					console.error("[ODataService] Create form failed:", r.status);
					return r.text().then(function (t) { console.error(t); return null; });
				}
				return r.json();
			})
			.catch(function (e) { console.error("[ODataService] Create form error:", e); return null; });
		},

		/**
		 * Update (PATCH) an existing ElogForm by ID.
		 * @param {string} sFormGuid - the OData GUID
		 * @param {object} oUpdates - fields to update
		 */
		updateForm: function (sFormGuid, oUpdates) {
			return fetch(_url("/ElogForms(" + sFormGuid + ")"), {
				method: "PATCH",
				headers: _headers(),
				body: JSON.stringify(oUpdates)
			})
			.then(function (r) {
				if (!r.ok) {
					console.error("[ODataService] Update form failed:", r.status);
					return r.text().then(function (t) { console.error(t); return null; });
				}
				// 204 No Content is typical for PATCH
				if (r.status === 204) { return { ok: true }; }
				return r.json();
			})
			.catch(function (e) { console.error("[ODataService] Update form error:", e); return null; });
		},

		/**
		 * Delete an ElogForm by ID.
		 * @param {string} sFormGuid
		 */
		deleteForm: function (sFormGuid) {
			return fetch(_url("/ElogForms(" + sFormGuid + ")"), {
				method: "DELETE",
				headers: _headers()
			})
			.then(function (r) {
				if (!r.ok) {
					console.error("[ODataService] Delete form failed:", r.status);
					return false;
				}
				return true;
			})
			.catch(function (e) { console.error("[ODataService] Delete form error:", e); return false; });
		},

		// ── CRUD: Fields ────────────────────────────────────────────────

		/**
		 * Create a new ElogField.
		 * @param {object} oFieldData - field properties including form_ID
		 */
		createField: function (oFieldData) {
			return fetch(_url("/ElogFields"), {
				method: "POST",
				headers: _headers(),
				body: JSON.stringify(oFieldData)
			})
			.then(function (r) {
				if (!r.ok) {
					console.error("[ODataService] Create field failed:", r.status);
					return r.text().then(function (t) { console.error(t); return null; });
				}
				return r.json();
			})
			.catch(function (e) { console.error("[ODataService] Create field error:", e); return null; });
		},

		/**
		 * Update (PATCH) an existing ElogField by ID.
		 * @param {string} sFieldGuid - the OData GUID
		 * @param {object} oUpdates - fields to update
		 */
		updateField: function (sFieldGuid, oUpdates) {
			return fetch(_url("/ElogFields(" + sFieldGuid + ")"), {
				method: "PATCH",
				headers: _headers(),
				body: JSON.stringify(oUpdates)
			})
			.then(function (r) {
				if (!r.ok) {
					console.error("[ODataService] Update field failed:", r.status);
					return r.text().then(function (t) { console.error(t); return null; });
				}
				if (r.status === 204) { return { ok: true }; }
				return r.json();
			})
			.catch(function (e) { console.error("[ODataService] Update field error:", e); return null; });
		},

		/**
		 * Delete an ElogField by ID.
		 * @param {string} sFieldGuid
		 */
		deleteField: function (sFieldGuid) {
			return fetch(_url("/ElogFields(" + sFieldGuid + ")"), {
				method: "DELETE",
				headers: _headers()
			})
			.then(function (r) {
				if (!r.ok) {
					console.error("[ODataService] Delete field failed:", r.status);
					return false;
				}
				return true;
			})
			.catch(function (e) { console.error("[ODataService] Delete field error:", e); return false; });
		},

		/**
		 * Batch-update multiple fields for a form (admin save).
		 * Takes the admin model fields array and PATCHes each one that has an OData ID.
		 * @param {Array} aFields - array of admin field objects (must have _odata_ID on the source field)
		 * @param {object} oFormDef - the catalog form definition (to look up OData IDs from the original fields)
		 * @returns {Promise<boolean>} - true if all updates succeeded
		 */
		batchUpdateFields: function (aFields, oFormDef) {
			var promises = [];
			var that = this;

			aFields.forEach(function (fld) {
				// Find the matching original field to get the OData ID
				var odataId = null;
				if (fld.group === "Header") {
					var match = (oFormDef.headerFields || []).filter(function (h) { return h.key === fld.key; })[0];
					if (match) { odataId = match._odata_ID; }
				} else {
					var cols = (oFormDef.grid && oFormDef.grid.columns) || [];
					var match2 = cols.filter(function (c) { return c.k === fld.key; })[0];
					if (match2) { odataId = match2._odata_ID; }
				}

				if (!odataId) {
					console.warn("[ODataService] No OData ID for field:", fld.key, "- skipping PATCH");
					return;
				}

				// Build update payload
				var oUpdates = {
					label: fld.label,
					fieldType: fld.type,
					required: !!fld.required
				};
				if (fld.optionsCsv !== undefined) {
					oUpdates.options = fld.optionsCsv || null;
				}
				if (fld.validation !== undefined) {
					oUpdates.validation = fld.validation || null;
				}
				if (fld.section !== undefined) {
					oUpdates.section = fld.section || null;
				}

				promises.push(that.updateField(odataId, oUpdates));
			});

			return Promise.all(promises).then(function (results) {
				var allOk = results.every(function (r) { return r !== null; });
				if (allOk) {
					console.log("[ODataService] All field updates saved to CAPM DB");
				} else {
					console.warn("[ODataService] Some field updates failed");
				}
				return allOk;
			});
		},

		/**
		 * Seed the CAPM database with forms from the static catalog.
		 * Performs deep inserts (form + fields).
		 * @param {Array} catalogForms - forms from catalog.json
		 */
		seedDatabase: function (catalogForms) {
			var promises = [];
			var that = this;

			catalogForms.forEach(function (cf) {
				var odataForm = {
					formId: cf.id,
					name: cf.name || "",
					documentNo: cf.documentNo || "",
					plantId: cf.plantId || "",
					departmentId: cf.departmentId || "",
					section: cf.section || "",
					frequency: cf.frequency || "",
					entriesTitle: cf.entriesTitle || "Entries",
					keywords: (cf.keywords || []).join(", "),
					signature: cf.signature || "",
					isActive: cf.isActive !== false,
					fields: []
				};

				var sortCounter = 1;
				
				function addFields(arr, category) {
					if (!arr) return;
					arr.forEach(function (f) {
						odataForm.fields.push({
							fieldKey: f.key || f.k || "",
							label: f.label || f.k || f.key || "",
							fieldType: f.type || "text",
							section: f.section || "",
							fieldCategory: category,
							required: !!f.required,
							sortOrder: sortCounter++,
							options: (f.options || []).join(", "),
							validation: f.validation || ""
						});
					});
				}

				addFields(cf.headerFields, "header");
				if (cf.grid && cf.grid.columns) {
					addFields(cf.grid.columns, "grid");
				}
				addFields(cf.footerFields, "footer");

				promises.push(that.createForm(odataForm));
			});

			return Promise.all(promises).then(function (results) {
				var allOk = results.every(function (r) { return r !== null; });
				if (allOk) {
					console.log("[ODataService] Database seeded successfully.");
				}
				return allOk;
			});
		}
	};
});
