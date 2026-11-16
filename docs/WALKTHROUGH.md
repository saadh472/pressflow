# PressFlow walkthrough

Use fictional details throughout this local demonstration. No action in the payment ledger moves real money.

## 1. Open the studio

Run launcher/Start PressFlow.cmd from Windows and open the URL printed in its terminal, normally http://127.0.0.1:8089. Choose **Use demo account**, then **Open workspace**. The sample account is operator / DemoPass123!.

The first run has three fictional customers and four print services. The order queue starts empty.

## 2. Add a customer

Open **Customers** and choose **Add customer**. Enter an invented name, a valid fictional email such as jamie@example.com, a phone such as +00 000 0004, and an optional company. Save it, then search by its name or email. A duplicate email returns a clear validation error.

## 3. Create a print job

Open **Catalog** and choose **Create order** on **Business cards**. That service is preselected. Select the customer and give the job a title. Enter a quantity of 100 on standard stock without lamination. On an unchanged demo catalog, the server quote should show **PKR 15.00 per unit** and **PKR 1,500.00 total**.

Select premium stock to see the 20% adjustment. Lamination adds PKR 20.00 per unit. Choose a valid due date and save. The new job appears in **Orders** and the overview's active count.

To explore catalog management, add an invented service with a description and standard unit price. Edit its details or clear **Available for new orders** to archive it. Archived cards remain visible for editing, while their **Create order** button is disabled. Previous order labels and totals remain unchanged.

## 4. Move work through production

Open the order. Use **Move to Design**, then **Move to Printing**. A laminated job must pass through **Lamination** before **Ready**; other jobs move directly from Printing to Ready. Finish with **Delivered**.

The server rejects skipped or stale transitions. If another window updates the same order, refresh it before taking the next action. Cancellation is available only before printing and while no receipts have been recorded.

## 5. Record a fictional receipt

Choose **Record payment**, select an outstanding order, and enter an amount below its remaining balance. Use a demo reference such as SAMPLE-001. Save it and inspect the payment list and updated balance.

An amount above the balance is rejected. **Use full balance** fills the remaining amount. These are bookkeeping records only; the method labels do not invoke a bank or payment provider.

## 6. Check persistence

Stop the server, restart it with the same database, and sign in again. Customers, orders, production states, and receipts remain. Login sessions are separate from the saved business records.

If a connection fails while saving, refresh the records before repeating the action. The browser keeps the same request ID for an unchanged retry while that form stays open, and the server prevents an order or receipt from being saved twice.
