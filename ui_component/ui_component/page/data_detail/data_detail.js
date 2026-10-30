frappe.pages['data-detail'].on_page_load = function(wrapper) {
  var page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'User Detail',
    single_column: true
  });

  wrapper.page = page;

  $(page.body).html(`
    <div class="container mt-3">
      <div id="detail-area"></div>
    </div>
  `);
};


frappe.pages['data-detail'].on_page_show = function(wrapper) {
  const page = wrapper.page;

  // get route param (ID)
  const route = frappe.get_route();
  const user_id = route[1];

  // get optional passed data
  const data = frappe.route_options || {};
  console.log('data: ', data);

  let html = `
    <h4>User Detail</h4>

    <p><strong>ID:</strong> ${user_id || data.id || '-'}</p>
    <p><strong>Name:</strong> ${data.name || '-'}</p>

    <button class="btn btn-secondary back-btn">Back</button>
  `;

  $('#detail-area').html(html);

  // clear route options after use
  frappe.route_options = null;

  // back button
  $('#detail-area .back-btn').off('click').on('click', function() {
    frappe.set_route('list-data');
  });
};
