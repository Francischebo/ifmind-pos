import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiService, API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  AlertCircle,
  Download,
  Upload,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit_cost: number;
  retail_price: number;
  stock_on_hand: number;
  reorder_level: number;
  is_parent?: boolean;
  variant_attributes?: Record<string, string>;
}

interface ProductImportResponse {
  message?: string;
  created: number;
  skipped: number;
  summary: string;
  errors: string[];
}

export default function Products() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.barcode?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [searchTerm, products]);

  const loadProducts = async () => {
    try {
      const data = await ApiService.get<Product[]>("/products");

      // Filter out parent container products since they don't hold physical stock, we only want sellable items
      const sellableProducts = (data || []).filter((p) => !p.is_parent);

      const sortedData = sellableProducts.sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setProducts(sortedData);
      setFilteredProducts(sortedData);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoading(false);
    }
  };

  const downloadImportTemplate = async () => {
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(`${API_BASE_URL}/products/template`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to download the product import template.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "product_import_template.csv";
      anchor.click();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Template downloaded",
        description:
          "Use the CSV template to add multiple products and re-upload it.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to download the product template.",
        variant: "destructive",
      });
    }
  };

  const handleImportProducts = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportSummary("");
    setImportErrors([]);

    try {
      const token = localStorage.getItem("jwt_token");
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/products/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => ({})) as Partial<ProductImportResponse>;

      if (!response.ok) {
        throw new Error(payload.message || "Unable to import products.");
      }

      if (
        !Number.isInteger(payload.created) ||
        !Number.isInteger(payload.skipped) ||
        typeof payload.summary !== "string"
      ) {
        throw new Error("The server returned an incomplete product import result. Refresh the product list before retrying.");
      }

      const errors = Array.isArray(payload.errors) ? payload.errors : [];
      const importDescription = errors.length > 0
        ? `${payload.summary} ${errors.slice(0, 2).join(" ")}${errors.length > 2 ? ` And ${errors.length - 2} more row error(s); see the import details below.` : ""}`
        : payload.summary;

      toast({
        title: payload.created === 0 && payload.skipped > 0
          ? "Product import needs attention"
          : payload.skipped > 0
            ? "Products imported with skipped rows"
            : "Products imported",
        description: importDescription,
        variant: payload.created === 0 && payload.skipped > 0 ? "destructive" : "default",
      });
      setImportSummary(payload.summary);
      setImportErrors(errors);

      await loadProducts();
    } catch (error) {
      setImportSummary("");
      setImportErrors([]);
      toast({
        title: "Import failed",
        description:
          error instanceof Error
            ? error.message
            : "Please check the file format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Products</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your product catalog
          </p>
        </div>
        {userRole === "admin" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadImportTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isImporting ? "Importing..." : "Bulk Import"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={handleImportProducts}
            />
            <Button onClick={() => navigate("/products/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        )}
      </div>

      {importSummary && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <p className="font-medium">{importSummary}</p>
            {importErrors.length > 0 && (
              <ul
                className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-destructive"
                aria-label="Rows skipped during product import"
              >
                {importErrors.map((message, index) => (
                  <li key={`${index}-${message}`}>{message}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Product Catalog</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-sm sm:text-base"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sm:text-sm">SKU</TableHead>
                <TableHead className="hidden md:table-cell text-xs sm:text-sm">
                  Barcode
                </TableHead>
                <TableHead className="text-xs sm:text-sm">Name</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">
                  Cost
                </TableHead>
                <TableHead className="text-right text-xs sm:text-sm">
                  Price
                </TableHead>
                <TableHead className="text-right text-xs sm:text-sm">
                  Stock
                </TableHead>
                <TableHead className="text-xs sm:text-sm">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const isLowStock =
                  product.stock_on_hand <= product.reorder_level;
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium text-xs sm:text-sm">
                      {product.sku}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs sm:text-sm">
                      {product.barcode || "-"}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      {product.name}
                      {product.variant_attributes && (
                        <span className="ml-2 text-muted-foreground text-xs">
                          (
                          {Object.entries(product.variant_attributes)
                            .map(([k, v]) => `${v}`)
                            .join(" / ")}
                          )
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm">
                      {product.unit_cost.toLocaleString("en-KE", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm">
                      {product.retail_price.toLocaleString("en-KE", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm">
                      {product.stock_on_hand}
                    </TableCell>
                    <TableCell>
                      {isLowStock ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-accent">
                          In Stock
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
