/* Example programs shown in the "Examples" menu.
 * To add a new one: copy a block below, give it a new id/title and paste the pseudo code
 * between the backticks ( ` ). Do not use backticks inside the pseudo code. */
window.PSEUDO_EXAMPLES = [
  {
    id: "basics",
    title: "Basics (variables, IF, loops, lists)",
    code: `// Basics: variables, IF, loops and lists
// Press RUN (or Ctrl + Enter) to see the result.

SET name = "Alex"
SET age = 17
PRINT "Hello, " + name + "!"

IF age >= 18 THEN
    PRINT name + " is an adult."
ELSE
    PRINT name + " is " + (18 - age) + " year(s) away from 18."
END IF

// Count from 1 to 5
FOR i FROM 1 TO 5:
    PRINT "Count: " + i
END FOR

// Work with a list
SET scores = [72, 95, 88, 64]
ADD 100 TO scores
SET total = 0
FOR EACH score IN scores:
    SET total = total + score
END FOR
PRINT "Scores: " + JOIN(scores, ", ")
PRINT "Average: " + ROUND(total / LENGTH(scores), 1)

// A dictionary (key -> value)
SET stock = {"apple": 3, "banana": 0}
IF "apple" EXISTS IN stock THEN
    PRINT "Apples in stock: " + stock["apple"]
END IF

// WHILE loop
SET countdown = 3
WHILE countdown > 0 DO
    PRINT countdown + "..."
    SET countdown = countdown - 1
END WHILE
PRINT "Lift off!"
`
  },
  {
    id: "ecommerce",
    title: "E-commerce Product Analytics",
    code: `// E-commerce Product Analytics - Complete System

// Sample data: 50 product purchases
SET purchases = [
    "Laptop", "Mouse", "Keyboard", "Laptop", "Monitor", "Mouse",
    "Laptop", "Headset", "Mouse", "Keyboard", "Laptop", "Mouse",
    "Monitor", "Laptop", "Mouse", "Keyboard", "Laptop", "Headset",
    "Mouse", "Laptop", "Keyboard", "Mouse", "Laptop", "Monitor",
    "Mouse", "Laptop", "Keyboard", "Mouse", "Laptop", "Headset",
    "Mouse", "Laptop", "Mouse", "Keyboard", "Laptop", "Monitor",
    "Mouse", "Laptop", "Keyboard", "Mouse", "Laptop", "Headset",
    "Mouse", "Laptop", "Mouse", "Keyboard", "Laptop", "Monitor",
    "Mouse", "Laptop"
]

// Order IDs (some duplicates for testing)
SET orderIDs = [
    1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
    1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020,
    1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030,
    1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040,
    1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1003  // Duplicate!
]

// Analysis 1: Count sales per product

PRINT "========================================="
PRINT "PRODUCT SALES ANALYSIS"
PRINT "========================================="

SET productCounts = {}

FOR EACH product IN purchases:
    IF product EXISTS IN productCounts THEN
        SET productCounts[product] = productCounts[product] + 1
    ELSE
        SET productCounts[product] = 1
    END IF
END FOR

PRINT ""
PRINT "Total Sales Per Product:"
PRINT "------------------------"
FOR EACH product IN productCounts:
    PRINT product + ": " + productCounts[product] + " units"
END FOR

// Analysis 2: Find best-selling product

SET bestProduct = null
SET maxSales = 0

FOR EACH product IN productCounts:
    IF productCounts[product] > maxSales THEN
        SET maxSales = productCounts[product]
        SET bestProduct = product
    END IF
END FOR

PRINT ""
PRINT "Best-Selling Product:"
PRINT "---------------------"
PRINT bestProduct + " with " + maxSales + " units sold"
PRINT "This represents " + ROUND((maxSales / LENGTH(purchases)) * 100, 1) + "% of total sales"

// Analysis 3: Find slow-moving products (< 5 units)

SET threshold = 5
SET slowMovers = []

FOR EACH product IN productCounts:
    IF productCounts[product] < threshold THEN
        ADD product TO slowMovers
    END IF
END FOR

PRINT ""
PRINT "Slow-Moving Products (< " + threshold + " units):"
PRINT "-------------------------------------------"
IF LENGTH(slowMovers) == 0 THEN
    PRINT "No slow-moving products found."
ELSE
    FOR EACH product IN slowMovers:
        PRINT "- " + product + ": " + productCounts[product] + " units (needs promotion!)"
    END FOR
END IF

// Analysis 4: Top 3 best-selling products

// Convert to list of [product, count] pairs
SET productList = []
FOR EACH product IN productCounts:
    ADD [product, productCounts[product]] TO productList
END FOR

// Sort by count (descending)
SORT productList BY count DESCENDING

// Display top 3
PRINT ""
PRINT "Top 3 Best-Selling Products:"
PRINT "----------------------------"
FOR i FROM 0 TO 2:
    IF i < LENGTH(productList) THEN
        SET product = productList[i][0]
        SET count = productList[i][1]
        PRINT (i + 1) + ". " + product + ": " + count + " units"
    END IF
END FOR

// Analysis 5: Data quality check - Duplicate order IDs

SET orderCounts = {}
SET duplicates = []

FOR EACH orderID IN orderIDs:
    IF orderID EXISTS IN orderCounts THEN
        SET orderCounts[orderID] = orderCounts[orderID] + 1
        IF orderCounts[orderID] == 2 THEN  // First time we detect it's a duplicate
            ADD orderID TO duplicates
        END IF
    ELSE
        SET orderCounts[orderID] = 1
    END IF
END FOR

PRINT ""
PRINT "Data Quality Check:"
PRINT "-------------------"
IF LENGTH(duplicates) == 0 THEN
    PRINT "✓ All order IDs are unique. Data quality is good!"
ELSE
    PRINT "⚠ WARNING: Duplicate order IDs detected!"
    FOR EACH orderID IN duplicates:
        PRINT "  - Order ID " + orderID + " appears " + orderCounts[orderID] + " times"
    END FOR
    PRINT "  Action required: Investigate and clean data."
END IF

// Summary Report

PRINT ""
PRINT "========================================="
PRINT "SUMMARY REPORT"
PRINT "========================================="
PRINT "Total transactions: " + LENGTH(purchases)
PRINT "Unique products: " + LENGTH(productCounts)
PRINT "Best seller: " + bestProduct + " (" + maxSales + " units)"
PRINT "Products needing attention: " + LENGTH(slowMovers)
PRINT "Data quality issues: " + LENGTH(duplicates) + " duplicate order IDs"
PRINT ""
PRINT "Recommendations:"
PRINT "1. Restock " + bestProduct + " - high demand"
PRINT "2. Create promotion for slow-moving items"
PRINT "3. Investigate duplicate order IDs"
PRINT "4. Consider bundling popular items (Laptop + Mouse)"
PRINT "========================================="
`
  }
];
if (typeof module !== "undefined") module.exports = window.PSEUDO_EXAMPLES;
