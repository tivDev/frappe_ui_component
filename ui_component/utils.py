import frappe
import random
import string


@frappe.whitelist()
def create_random_customer(count=100, length=8):
    """Create random customers and return all successfully created customers."""

    count = int(count)
    length = int(length)

    if count < 1:
        frappe.throw("Count must be at least 1.")

    if length < 1:
        frappe.throw("Length must be at least 1.")

    created_customers = []

    for _ in range(count):
        # Generate a random customer name
        customer_name = ''.join(
            random.choices(
                string.ascii_letters + string.digits,
                k=length
            )
        )

        # Create the Customer document
        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "customer_type": "Individual",
            "customer_group": "Commercial",
            "territory": "All Territories"
        })

        # Insert the document
        customer.insert()
        frappe.db.commit()  # Commit the transaction to save the customer

        created_customers.append({
            "name": customer.name,
            "customer_name": customer.customer_name
        })

    return {
        "success": True,
        "message": f"{len(created_customers)} customer(s) created successfully.",
        "total_created": len(created_customers),
        "customers": created_customers
    }