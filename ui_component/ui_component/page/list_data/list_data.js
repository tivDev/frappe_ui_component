frappe.pages['list-data'].on_page_load = function(wrapper) {
  var page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'User List',
    single_column: true
  });

  wrapper.page = page;

  // static container
  $(page.body).html(`
    <div class="container mt-3">
      <div id="table-area"></div>
    </div>
  `);
};


frappe.pages['list-data'].on_page_show = function(wrapper) {
  const page = wrapper.page;

  // sample data
  const data = [
    { id: 'EMP-001', name: 'John Doe' },
    { id: 'EMP-002', name: 'Jane Smith' },
    { id: 'EMP-003', name: 'Mike Johnson' }
  ];

  let html = `
    <table class="table table-bordered">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(row => {
    html += `
      <tr>
        <td>${row.id}</td>
        <td>${row.name}</td>
        <td>
          <button class="btn btn-sm btn-primary view-btn"
            data-id="${row.id}"
            data-name="${row.name}">
            View
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  // render
  $('#table-area').html(html);

  // prevent duplicate binding
  $('#table-area .view-btn').off('click').on('click', function() {
    const row = {
      id: $(this).data('id'),
      name: $(this).data('name')
    };

    // optional: pass full object
    frappe.route_options = row;

    // go detail page
    frappe.set_route('data-detail', row.id);
  });
};
