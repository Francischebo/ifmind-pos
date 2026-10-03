import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductsPage from "./Products";
import LocationsPage from "./Locations";
import StockMovementsPage from "./StockMovements";
import InventoryTransfersPage from "./InventoryTransfers";
import InventoryAdjustmentsPage from "./InventoryAdjustments";
import StockTakesPage from "./StockTakes";

const tabItems = [
  { value: "products", label: "Products" },
  { value: "locations", label: "Locations" },
  { value: "stock-movements", label: "Stock Movements" },
  { value: "transfers", label: "Transfers" },
  { value: "adjustments", label: "Adjustments" },
  { value: "stock-takes", label: "Stock Takes" },
];

export default function InventoryOperations() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventory Operations</h1>
          <p className="text-muted-foreground">
            Manage product setup, locations, and movement workflows from one
            place
          </p>
        </div>

        <Tabs defaultValue="products" className="w-full">
          <TabsList className="h-auto w-full flex-wrap justify-start rounded-lg bg-muted/60 p-1">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 sm:flex-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="products" className="mt-6">
            <ProductsPage />
          </TabsContent>

          <TabsContent value="locations" className="mt-6">
            <LocationsPage />
          </TabsContent>

          <TabsContent value="stock-movements" className="mt-6">
            <StockMovementsPage />
          </TabsContent>

          <TabsContent value="transfers" className="mt-6">
            <InventoryTransfersPage />
          </TabsContent>

          <TabsContent value="adjustments" className="mt-6">
            <InventoryAdjustmentsPage />
          </TabsContent>

          <TabsContent value="stock-takes" className="mt-6">
            <StockTakesPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
